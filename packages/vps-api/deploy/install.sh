#!/bin/bash
# VPS API Installation Script (without Docker)
# Run as root on Debian 11

set -e

echo "=== Email Filter VPS API Installation ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# Install Node.js 20
echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install build tools for native modules
echo "Installing build tools..."
apt-get install -y python3 build-essential

# Install pnpm
echo "Installing pnpm..."
npm install -g pnpm

# Create app directory
APP_DIR="/opt/email-filter"
echo "Setting up application in $APP_DIR..."

# Create data directory
mkdir -p /var/lib/email-filter
chown -R node:node /var/lib/email-filter 2>/dev/null || true

# Install dependencies
cd $APP_DIR
echo "Installing dependencies..."
pnpm install

# Build the project
echo "Building project..."
pnpm --filter @email-filter/shared build
pnpm --filter @email-filter/vps-api build

# Copy schema.sql to dist
cp packages/vps-api/src/db/schema.sql packages/vps-api/dist/db/

# Create .env file if not exists
if [ ! -f "$APP_DIR/.env" ]; then
  echo "Creating .env file..."
  cp $APP_DIR/.env.example $APP_DIR/.env
  echo "Please edit $APP_DIR/.env with your settings"
fi

# Create systemd service
echo "Creating systemd service..."
cat > /etc/systemd/system/email-filter-api.service << 'EOF'
[Unit]
Description=Email Filter VPS API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/email-filter/packages/vps-api
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=DB_PATH=/var/lib/email-filter/filter.db
EnvironmentFile=/opt/email-filter/.env

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
systemctl daemon-reload

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit /opt/email-filter/.env with your settings"
echo "2. Start the service: systemctl start email-filter-api"
echo "3. Enable auto-start: systemctl enable email-filter-api"
echo "4. Check status: systemctl status email-filter-api"
echo "5. View logs: journalctl -u email-filter-api -f"
