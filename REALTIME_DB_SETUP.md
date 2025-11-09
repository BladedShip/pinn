# Firebase Realtime Database Setup Guide

## Why Realtime Database?

✅ **True Free Tier** - No billing/credit card required  
✅ **1 GB storage** - More than enough for notes  
✅ **10 GB/month transfer** - Plenty for syncing  
✅ **Simple REST API** - Works with just API key (no OAuth needed!)  
✅ **No CORS issues** - Works immediately  

## Quick Setup (5 minutes)

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** (or select existing)
3. Enter project name (e.g., "Pinn Notes")
4. Disable Google Analytics (optional)
5. Click **"Create project"**

### Step 2: Enable Realtime Database

1. In the left sidebar, click **"Realtime Database"**
2. Click **"Create database"**
3. Choose a location (select closest to you) - **IMPORTANT: Note the region you choose!**
4. Click **"Enable"**
5. Choose **"Start in test mode"** (allows read/write for 30 days)
6. Click **"Enable"**

**Important:** After creating the database, you'll see a URL like:
- `https://{projectId}-default-rtdb.{region}.firebasedatabase.app/` (new format)
- OR `https://{projectId}.firebaseio.com/` (old format)

**Copy this URL** - you'll need to verify it matches your Project ID format.

### Step 3: Get Your Credentials

1. Click the **gear icon** ⚙️ next to "Project Overview"
2. Select **"Project settings"**
3. Under the **"General"** tab:
   - Copy your **Project ID** (e.g., `pinn-notes-12345`)
   - Scroll down to "Your apps" section
   - If no web app exists, click the `</>` (Web) icon
   - Copy the **Web API Key** (looks like: `AIzaSyXXX...`)

### Step 4: Configure Database Rules (Optional, for after 30 days)

The test mode works for 30 days. For permanent access:

1. Go to **Realtime Database** → **Rules** tab
2. Replace with:

```json
{
  "rules": {
    "users": {
      "$userId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

3. Click **"Publish"**

⚠️ **Note**: This allows anyone to read/write. For better security, implement Firebase Authentication.

### Step 5: Configure in Pinn

1. Open Pinn app
2. Click Settings (gear icon)
3. Go to **"Cloud Sync"** tab
4. Enter:
   - **API Key**: Paste the Web API Key
   - **Project ID**: Paste your Project ID
5. Click **"Test Configuration"** to verify
6. Click **"Enable Cloud Sync"**

### Step 6: Start Syncing!

- Click **"Sync to Cloud"** to upload your notes
- On another device, configure the same project and click **"Download from Cloud"**

## How It Works

### Data Structure

Your data is stored in Realtime Database as:

```
Realtime Database:
└── users/
    └── {your-unique-id}/
        ├── notes/
        │   └── content: "{your notes JSON}"
        ├── folders/
        │   └── content: "{your folders JSON}"
        ├── flows/
        │   └── content: "{your flows JSON}"
        ├── flowCategories/
        │   └── content: "{your categories JSON}"
        ├── theme/
        │   └── content: "{your theme JSON}"
        └── _metadata/
            ├── lastSync: "timestamp"
            └── filesCount: 5
```

### Unique User ID

- Each device/browser gets a unique ID stored in localStorage
- To sync the same data across devices, you can manually copy the `pinn.cloudUserId` value between devices
- Or just download from cloud after syncing on your primary device

## Free Tier Limits

| Resource | Limit | More than enough for |
|----------|-------|---------------------|
| Storage | 1 GB | ~1 million notes |
| Transfer | 10 GB/month | ~3,000 syncs |
| Connections | 100 concurrent | Plenty |

For a personal notes app, these limits are extremely generous!

## Advantages Over Firestore

| Feature | Realtime Database | Firestore |
|---------|-------------------|-----------|
| API Key Auth | ✅ Works directly | ❌ Needs OAuth token |
| Setup Complexity | ⚡ Very simple | 🐌 More complex |
| REST API | ✅ Simple | ❌ Complex |
| Free Tier | ✅ Yes | ✅ Yes |
| CORS | ✅ Not needed | ✅ Not needed |

## Troubleshooting

### "Permission denied" error

**Solution**: Update Realtime Database rules (see Step 4)

### "Authentication failed" error

**Solution**: 
- Double-check your API key in Firebase Console → Project Settings
- Make sure Realtime Database is enabled (not just Firestore)
- Verify you're using the Web API Key, not a service account key

### "Network error" message

**Solution**: Check your internet connection

### "No data found" when downloading

**Solution**: Make sure you've synced to cloud at least once from another device

### "Cannot validate cloud configuration"

**Solution**: 
- Make sure Realtime Database is enabled (not just Firestore)
- Check that your Project ID matches exactly
- Verify your API key is correct
- Make sure the database URL is accessible (check Firebase Console)

### "404 Not Found" error

**Solution**: 
- **Most Common:** The database URL format might be wrong. Check your Firebase Console:
  1. Go to Realtime Database
  2. Look at the database URL shown at the top
  3. It should be something like: `https://{projectId}-default-rtdb.{region}.firebasedatabase.app/`
  4. Make sure your Project ID matches exactly (case-sensitive)
- Verify the database is actually created and enabled
- Try accessing the database URL directly in your browser (should show `null` or your data)
- Make sure you're using Realtime Database, not Firestore

## Security Considerations

1. **API Key Visibility** - The API key is stored locally and visible in browser. This is normal for web apps.

2. **Database Rules** - The basic rules allow anyone to read/write if they know your project details. For production:
   - Implement Firebase Authentication
   - Use stricter rules that require auth
   - Add user-based permissions

3. **Data Privacy** - Your data is stored in YOUR Firebase project. You can:
   - Delete everything anytime from Firebase Console
   - Export/backup from Realtime Database directly
   - Monitor usage in Firebase Console

## Production Deployment

When deploying to production:

1. **Update Database Rules** - Add authentication requirements
2. **Enable Firebase Authentication** - Use email/password or Google sign-in
3. **Monitor Usage** - Check Firebase Console for quota usage
4. **Set up Alerts** - Get notified if approaching limits

## Support

If you encounter issues:

1. Check browser console for detailed error messages
2. Verify Realtime Database is enabled in Firebase Console
3. Check that rules allow read/write access
4. Try in incognito mode to rule out cache issues
5. Make sure you're using Realtime Database, not Firestore

---

**Happy Syncing! 🎉**

Simple, free, and works immediately with just an API key!

