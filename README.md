# BPPE 2025 Giveaways Showcase

A web interface that displays data from a Google Sheet, showing giveaway information for the BPPE 2025 event in a visually pleasing format.

## Features

- Displays giveaway information from a Google Sheet
- Shows Discord images when available
- Responsive design that works on mobile and desktop
- Search functionality to filter giveaways
- Direct links to websites and Discord posts
- Multiple fallback methods to ensure data availability

## Setup

### Local Development

There are two ways to run this app locally:

#### Method 1: Simple Viewing (with Sample Data)

1. Clone this repository
2. Open `index.html` in your browser
3. The app will automatically detect it's running locally (as a file://) and use sample data

#### Method 2: Full Functionality (with Real Data)

Due to CORS restrictions, Google Sheets data can't be accessed directly from a local HTML file. To get around this:

1. Clone this repository
2. Use a local web server to serve the files. Options include:
   - Using Python: `python -m http.server 8000` in the project directory
   - Using Node.js: Install `http-server` globally with `npm install -g http-server` and run `http-server` in the project directory
   - Using VS Code's Live Server extension
3. Access the app via `http://localhost:8000` (or whatever port your server uses)

### Hosting on GitHub Pages

1. Fork this repository to your GitHub account
2. Go to the repository settings
3. Navigate to the "Pages" section
4. Under "Source", select the branch you want to deploy (usually `main` or `master`)
5. Click "Save"
6. Your site will be published at `https://[your-username].github.io/[repository-name]/`

When deployed to GitHub Pages or any web server, the app will try to access the Google Sheet directly.

### Data Backup Script

The repository includes a Python script (`fetch_sheet.py`) to fetch Google Sheet data and save it as a JSON file. This can be used to create a backup of the data:

1. Install Python requirements:
```
pip install requests
```

2. Run the script:
```
python fetch_sheet.py
```

3. The script will create a `data/giveaways.json` file that the web app can use as a fallback if direct Google Sheet access fails.

## Google Sheet Requirements

The app expects a Google Sheet with the following columns:
- Winner
- Twitch Name
- Discord Name
- Website
- Giveaway
- Discount
- Where Item ships from
- Shipping
- Giveaway Pictures

The Google Sheet must be published to the web and accessible without authentication for optimal functionality.

## Technical Details

This app uses:
- HTML5 for structure
- CSS3 for styling
- Vanilla JavaScript for functionality
- Google Sheets as a data source
- Responsive design with CSS Grid and Flexbox
- Multiple fallback methods for accessing Google Sheet data

## Handling CORS Issues

The app implements several strategies to handle Cross-Origin Resource Sharing (CORS) restrictions:

1. Detection of local file environment with fallback to sample data
2. Using CORS mode with proper headers in fetch requests
3. JSONP approach with a CORS proxy for accessing Google Sheets data
4. Sample data fallback to ensure something displays even if all network methods fail

## Data Access Methods

The app attempts to access the Google Sheet data using several methods, in this order:
1. Google Sheets API v4 (read-only, public access)
2. JSONP proxy for CSV data
3. Direct CSV export with CORS handling
4. JSONP for published sheet data
5. Fallback to sample data

This ensures the app works in a variety of environments and hosting scenarios.

## Notes on Discord Images

Due to Discord's API restrictions, the app can't directly fetch images from Discord links. Instead, it provides placeholders and makes the image container clickable to open the original Discord post.

## Customization

You can customize the appearance by modifying the `styles.css` file. 