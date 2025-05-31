# Deploy script for Railway
#!/bin/bash

echo "🚀 Starting deployment to Railway..."

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "npm install -g @railway/cli"
    exit 1
fi

# Login to Railway (if not already logged in)
echo "🔐 Checking Railway authentication..."
railway auth

# Deploy to Railway
echo "📦 Deploying to Railway..."
railway up

# Set environment variables
echo "⚙️ Setting up environment variables..."
echo "Please set your DISCORD_TOKEN in Railway dashboard:"
echo "https://railway.app/dashboard"

echo "✅ Deployment completed!"
echo "🎵 Your Happy House Bot should be online soon!"
