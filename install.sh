#!/bin/bash

# ===========================================
# Email Filter System - Installation Script
# ===========================================
# This script installs and configures the email filter system on a VPS
# Supports both systemd (native) and Docker deployment methods

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/email-filter"
DATA_DIR="${INSTALL_DIR}/data"
SERVICE_USER="www-data"

# Functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

check_os() {
    if [[ -f /etc/debian_version ]]; then
        OS="debian"
    elif [[ -f /etc/redhat-release ]]; then
        OS="redhat"
    else
        print_warn "Unsupported OS. This script is designed for Debian/Ubuntu."
    fi
}

install_nodejs() {
    print_info "Installing Node.js 20..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $NODE_VERSION -ge 20 ]]; then
            print_info "Node.js $(node -v) is already installed"
            return
        fi
    fi
    
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    
    print_info "Node.js $(node -v) installed successfully"
}

install_pnpm() {
    print_info "Installing pnpm..."
    
    if command -v pnpm &> /dev/null; then
        print_info "pnpm is already installed"
        return
    fi
    
    npm install -g pnpm
    print_info "pnpm installed successfully"
}

create_directories() {
    print_info "Creating directories..."
    
    mkdir -p "${INSTALL_DIR}"
    mkdir -p "${DATA_DIR}"
    
    chown -R ${SERVICE_USER}:${SERVICE_USER} "${DATA_DIR}"
    chmod 755 "${INSTALL_DIR}"
    chmod 750 "${DATA_DIR}"
    
    print_info "Directories created at ${INSTALL_DIR}"
}

copy_files() {
    print_info "Copying application files..."
    
    # Copy source files
    cp -r packages "${INSTALL_DIR}/"
    cp package.json "${INSTALL_DIR}/"
    cp pnpm-workspace.yaml "${INSTALL_DIR}/"
    cp pnpm-lock.yaml "${INSTALL_DIR}/"
    cp tsconfig.json "${INSTALL_DIR}/"
    
    # Copy environment template if .env doesn't exist
    if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
        cp .env.example "${INSTALL_DIR}/.env"
        print_warn "Created .env file from template. Please edit ${INSTALL_DIR}/.env with your settings."
    fi
    
    print_info "Files copied successfully"
}

install_dependencies() {
    print_info "Installing dependencies..."
    
    cd "${INSTALL_DIR}"
    pnpm install --frozen-lockfile
    
    print_info "Dependencies installed successfully"
}

build_packages() {
    print_info "Building packages..."
    
    cd "${INSTALL_DIR}"
    
    # Build shared package
    cd packages/shared
    pnpm build
    
    # Build vps-api
    cd ../vps-api
    pnpm build
    
    # Build vps-admin
    cd ../vps-admin
    pnpm build
    
    print_info "Packages built successfully"
}

setup_systemd() {
    print_info "Setting up systemd services..."
    
    # Copy service files
    cp "${INSTALL_DIR}/packages/vps-api/deploy/email-filter-api.service" /etc/systemd/system/
    cp "${INSTALL_DIR}/packages/vps-admin/deploy/email-filter-admin.service" /etc/systemd/system/
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable services
    systemctl enable email-filter-api
    systemctl enable email-filter-admin
    
    print_info "Systemd services configured"
}

start_services() {
    print_info "Starting services..."
    
    systemctl start email-filter-api
    
    # Wait for API to be ready
    sleep 3
    
    # Check if API is running
    if systemctl is-active --quiet email-filter-api; then
        print_info "email-filter-api is running"
    else
        print_error "email-filter-api failed to start"
        systemctl status email-filter-api
        exit 1
    fi
    
    systemctl start email-filter-admin
    
    if systemctl is-active --quiet email-filter-admin; then
        print_info "email-filter-admin is running"
    else
        print_warn "email-filter-admin failed to start (may be expected if not configured)"
    fi
}

setup_docker() {
    print_info "Setting up Docker deployment..."
    
    if ! command -v docker &> /dev/null; then
        print_info "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_info "Installing Docker Compose..."
        apt-get install -y docker-compose-plugin
    fi
    
    # Copy docker-compose.yml
    cp docker-compose.yml "${INSTALL_DIR}/"
    
    # Copy environment template if .env doesn't exist
    if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
        cp .env.example "${INSTALL_DIR}/.env"
        print_warn "Created .env file from template. Please edit ${INSTALL_DIR}/.env with your settings."
    fi
    
    print_info "Docker setup complete. Run 'docker compose up -d' in ${INSTALL_DIR} to start."
}

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --systemd     Install using systemd (native deployment)"
    echo "  --docker      Install using Docker"
    echo "  --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --systemd  # Install with systemd services"
    echo "  $0 --docker   # Install with Docker"
}

print_success() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}Installation Complete!${NC}"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Edit ${INSTALL_DIR}/.env with your configuration"
    echo "2. Set API_TOKEN to a secure random string"
    echo "3. Set DEFAULT_FORWARD_TO to your email address"
    echo "4. Set ADMIN_PASSWORD for the admin panel"
    echo ""
    
    if [[ "$DEPLOY_METHOD" == "systemd" ]]; then
        echo "Service commands:"
        echo "  systemctl status email-filter-api"
        echo "  systemctl restart email-filter-api"
        echo "  journalctl -u email-filter-api -f"
    else
        echo "Docker commands:"
        echo "  cd ${INSTALL_DIR}"
        echo "  docker compose up -d"
        echo "  docker compose logs -f"
    fi
    
    echo ""
    echo "API will be available at: http://localhost:3000"
    echo "Admin panel will be available at: http://localhost:3001"
    echo ""
}

# Main script
main() {
    DEPLOY_METHOD=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --systemd)
                DEPLOY_METHOD="systemd"
                shift
                ;;
            --docker)
                DEPLOY_METHOD="docker"
                shift
                ;;
            --help)
                print_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
    
    if [[ -z "$DEPLOY_METHOD" ]]; then
        print_error "Please specify a deployment method: --systemd or --docker"
        print_usage
        exit 1
    fi
    
    check_root
    check_os
    create_directories
    
    if [[ "$DEPLOY_METHOD" == "systemd" ]]; then
        install_nodejs
        install_pnpm
        copy_files
        install_dependencies
        build_packages
        setup_systemd
        start_services
    else
        copy_files
        setup_docker
    fi
    
    print_success
}

main "$@"
