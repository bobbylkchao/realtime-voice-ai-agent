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
cd ..

echo "✅ Deployment completed successfully!"

