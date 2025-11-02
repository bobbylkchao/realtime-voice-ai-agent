#!/bin/bash

set -e

BRANCH=$1

if [ -z "$BRANCH" ]; then
  echo "❌ Error: Branch name is required"
  echo "Usage: bash deploy.sh <branch-name>"
  exit 1
fi

echo "🚀 Starting deployment..."
echo "🌿 Branch: $BRANCH"

# Clean and pull latest code
echo "🧹 Cleaning local changes to ensure pure git tree..."
git fetch origin

# Discard all local changes
echo "🔄 Resetting all local changes..."
git reset --hard HEAD

# Remove all untracked files and directories
echo "🗑️  Removing untracked files..."
git clean -fd

# Checkout and sync with remote branch
echo "📥 Checking out branch: $BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
git pull

# Install frontend dependencies
echo "🔧 Installing dependencies..."
npm ci

# Build frontend
echo "🔨 Building frontend..."
npm run build

# Install backend dependencies
echo "🔧 Installing backend dependencies..."
cd backend
npm ci

# Build backend
echo "🔨 Building backend..."
npm run build

# Start/restart backend via pm2
echo "🔄 Managing backend service..."

# Check if pm2 process exists
if pm2 list 2>/dev/null | grep -q "realtime-agent-backend"; then
    echo "✅ Backend service exists, restarting..."
    pm2 restart realtime-agent-backend || {
        echo "⚠️  Warning: Failed to restart, trying to delete and start fresh..."
        pm2 delete realtime-agent-backend 2>/dev/null || true
        pm2 start dist/index.js --name realtime-agent-backend || {
          echo "⚠️  Warning: Failed to start with dist/index.js, trying npm start..."
          pm2 start npm --name realtime-agent-backend -- start
        }
    }
else
    echo "🚀 Backend service not found, starting..."
    # Start backend using compiled output
    pm2 start dist/index.js --name realtime-agent-backend || {
      echo "⚠️  Warning: Failed to start with dist/index.js, trying npm start..."
      pm2 start npm --name realtime-agent-backend -- start
    }
fi

# Verify backend service is running
echo "📊 Verifying backend service status..."

# Check if service exists and is online
SERVICE_STATUS=$(pm2 list 2>/dev/null | grep "realtime-agent-backend" || echo "")

if [ -z "$SERVICE_STATUS" ]; then
    echo "❌ Error: Backend service 'realtime-agent-backend' not found in pm2"
    exit 1
fi

echo "📋 Service status:"
pm2 list 2>/dev/null | grep "realtime-agent-backend"

# Check if service is online
if echo "$SERVICE_STATUS" | grep -q "online"; then
    echo "✅ Backend service is running successfully"
else
    echo "❌ Error: Backend service is not in 'online' state"
    echo "Current status:"
    echo "$SERVICE_STATUS"
    exit 1
fi

cd ..
