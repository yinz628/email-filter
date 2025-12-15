import { getDatabase, generateId } from './index.js';

export interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
}

const SESSION_DURATION_HOURS = 24;

/**
 * Create a new session
 */
export function createSession(): Session {
  const db = getDatabase();
  const id = generateId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
  
  db.prepare(`
    INSERT INTO sessions (id, created_at, expires_at)
    VALUES (?, ?, ?)
  `).run(id, now.toISOString(), expiresAt.toISOString());
  
  return {
    id,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Validate a session
 */
export function validateSession(sessionId: string): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const row = db.prepare(`
    SELECT id FROM sessions
    WHERE id = ? AND expires_at > ?
  `).get(sessionId, now);
  
  return !!row;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  return result.changes > 0;
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): number {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  return result.changes;
}
