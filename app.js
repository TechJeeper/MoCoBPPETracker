// Constants - Default sheet ID with URL parameter override capability
const DEFAULT_SHEET_ID = '1pM8fMy2IVe_Sj1mBieFpMxO_to0Z6GDcirbUUZwCT9E';
// Check if a sheet ID was passed in the URL (e.g., ?sheet=XXXXX)
const urlParams = new URLSearchParams(window.location.search);
const SHEET_ID = urlParams.get('sheet') || DEFAULT_SHEET_ID;
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=0#gid=0`;

// Variables for auto-update feature
let autoUpdateInterval = null;
const AUTO_UPDATE_INTERVAL_MS = 60000; // 60 seconds
let lastDataChecksum = ''; // Used to determine if data has changed

// DOM Elements
const giveawaysTable = document.getElementById('giveaways-table');
const noResultsElement = document.getElementById('no-results');
const loadingContainer = document.querySelector('.loading-container');
const searchInput = document.getElementById('searchInput');

// Fetch data from Google Sheets
async function fetchSheetData(silent = false) {
    try {
        // Show a loading message with status updates (unless silent mode)
        if (!silent) {
            updateLoadingMessage('Connecting to data source...');
        }
        return await tryAllDataSources(silent);
    } catch (error) {
        console.error('All data fetch methods failed:', error);
        if (!silent) {
            showError('Could not retrieve data from Google Sheets.');
        }
        return [];
    }
}

// Update the loading message
function updateLoadingMessage(message) {
    const loadingText = loadingContainer.querySelector('p') || document.createElement('p');
    loadingText.textContent = message;
    if (!loadingText.parentNode) {
        loadingContainer.appendChild(loadingText);
    }
}

// Try all possible data sources
async function tryAllDataSources(silent = false) {
    // Try multiple methods concurrently with a race condition
    if (!silent) {
        updateLoadingMessage('Fetching data (this may take a moment)...');
    }
    
    // Define all data source methods we can try
    const dataSources = [
        fetchDirectCSV(silent),
        fetchWithCORSProxies(silent),
        fetchWithJSONP('csv').catch(e => null) // Make sure JSONP won't throw
    ];
    
    // Try them all at once and take the first one that succeeds
    const results = await Promise.allSettled(dataSources);
    
    // Find the first fulfilled result
    const firstSuccess = results.find(result => result.status === 'fulfilled' && result.value && result.value.length > 0);
    
    if (firstSuccess) {
        return firstSuccess.value;
    }
    
    // If all failed, throw an error
    throw new Error('All data fetch methods failed');
}

// Try the direct CSV approach with AllOrigins
async function fetchDirectCSV(silent = false) {
    try {
        console.log('Trying direct CSV export with AllOrigins (preferred method)...');
        if (!silent) {
            updateLoadingMessage('Connecting to AllOrigins...');
        }
        
        const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&id=${SHEET_ID}`;
        const response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(csvUrl), {
            method: 'GET',
            mode: 'cors',
            // Add a shorter timeout for fetch using AbortController
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (response.ok) {
            if (!silent) {
                updateLoadingMessage('LOADING BIG PP ENERGY...');
            }
            const csvText = await response.text();
            console.log('CSV data fetched successfully via AllOrigins');
            return parseCSV(csvText);
        } else {
            console.log('AllOrigins CSV method failed with status:', response.status);
            return null;
        }
    } catch (e) {
        console.log('Direct AllOrigins CSV method failed:', e);
        return null;
    }
}

// Try using other CORS proxies for the CSV export
async function fetchWithCORSProxies(silent = false) {
    const corsProxies = [
        'https://corsproxy.io/?',
        'https://cors-anywhere.herokuapp.com/'
    ];
    
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&id=${SHEET_ID}`;
    
    // Try all proxies concurrently
    const proxyPromises = corsProxies.map(proxy => {
        return new Promise(async (resolve) => {
            try {
                console.log(`Trying CSV with proxy: ${proxy}...`);
                if (!silent) {
                    updateLoadingMessage(`Trying alternate data source...`);
                }
                
                const response = await fetch(proxy + encodeURIComponent(csvUrl), {
                    method: 'GET',
                    mode: 'cors',
                    // Add a shorter timeout for fetch using AbortController
                    signal: AbortSignal.timeout(8000) // 8 second timeout
                });
                
                if (response.ok) {
                    const csvText = await response.text();
                    console.log(`CSV data fetched successfully via ${proxy}`);
                    resolve(parseCSV(csvText));
                } else {
                    console.log(`CORS proxy ${proxy} failed with status:`, response.status);
                    resolve(null);
                }
            } catch (e) {
                console.log(`CORS proxy ${proxy} failed:`, e);
                resolve(null);
            }
        });
    });
    
    // Wait for all proxies to finish and return the first successful result
    const results = await Promise.all(proxyPromises);
    const successfulResult = results.find(result => result && result.length > 0);
    return successfulResult || null;
}

// Fetch data using JSONP to bypass CORS
function fetchWithJSONP(method = 'csv') {
    return new Promise((resolve, reject) => {
        // Create a unique callback name
        const callbackName = 'jsonpCallback_' + Math.round(Math.random() * 1000000);
        
        // Define the callback function
        window[callbackName] = function(data) {
            // Clean up - delete the callback and remove the script tag
            delete window[callbackName];
            document.body.removeChild(script);
            
            // Process the data
            if (method === 'published') {
                resolve(processPublishedJSONP(data));
            } else {
                resolve(processCSVJSONP(data));
            }
        };
        
        // Determine which URL to use
        let url;
        if (method === 'published') {
            // For public published sheets
            url = `https://docs.google.com/spreadsheets/d/e/2PACX-${SHEET_ID}/pubhtml?gid=0&single=true&output=json&callback=${callbackName}`;
        } else {
            // For direct CSV access via a CORS proxy
            url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`)}`;
        }
        
        // Create and append the script tag
        const script = document.createElement('script');
        script.src = url;
        script.onerror = function() {
            // Clean up on error
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP request failed'));
        };
        
        // Add the script tag to the page
        document.body.appendChild(script);
        
        // Set a timeout in case the callback is never called
        setTimeout(() => {
            if (window[callbackName]) {
                delete window[callbackName];
                document.body.removeChild(script);
                reject(new Error('JSONP request timed out'));
            }
        }, 5000); // 5 second timeout (reduced from 10 seconds)
    });
}

// Process JSONP data from published sheet
function processPublishedJSONP(data) {
    if (!data || !data.table || !data.table.rows) {
        throw new Error('Invalid JSONP data format');
    }
    
    const rows = data.table.rows;
    
    // Log total number of rows
    console.log(`JSONP data contains ${rows.length} rows (including header)`);
    
    const processedRows = [];
    let keywordCounter = {}; // Track occurrences of important keywords for debugging
    
    // Skip header row (first row)
    rows.slice(1).forEach((row, index) => {
        // Calculate the actual spreadsheet row number (accounting for header)
        const spreadsheetRowNumber = index + 2; // +2 because index starts at 0 and we skip the header row
        
        // Skip completely empty rows
        if (!row.c || row.c.length === 0) {
            return;
        }
        
        // Extract key fields for more inclusive filtering - accept ANY content
        const result = {
            rowNumber: spreadsheetRowNumber, // Store the exact spreadsheet row number
            winner: getValueFromCell(row.c[0]),
            twitch: getValueFromCell(row.c[1]),
            discord: getValueFromCell(row.c[2]),
            website: getValueFromCell(row.c[3]),
            giveaway: getValueFromCell(row.c[4]),
            discount: getValueFromCell(row.c[5]),
            shipsFrom: getValueFromCell(row.c[6]),
            shipping: getValueFromCell(row.c[7]),
            pictureUrl: getValueFromCell(row.c[8])
        };
        
        // Track occurrences of keywords for debugging
        for (const [key, value] of Object.entries(result)) {
            if (typeof value === 'string') {
                const lowerValue = value.toLowerCase();
                // Track occurrences of specific keywords
                const keywordsToTrack = ['techjeeper', 'boosted', 'spark'];
                keywordsToTrack.forEach(keyword => {
                    if (lowerValue.includes(keyword)) {
                        keywordCounter[keyword] = (keywordCounter[keyword] || 0) + 1;
                        console.log(`JSONP: Found "${keyword}" in row ${spreadsheetRowNumber}, field: ${key}, value: ${value}`);
                    }
                });
            }
        }
        
        // Keep all rows with actual content (don't filter out N/A)
        // Only skip completely empty rows
        if (row.c.some(cell => cell && cell.v)) {
            processedRows.push(result);
        }
    });
    
    console.log('JSONP Keyword counter:', keywordCounter);
    console.log(`Total JSONP rows loaded: ${processedRows.length}`);
    return processedRows;
}

// Extract value from a cell in JSONP data
function getValueFromCell(cell) {
    if (!cell || !cell.v) return 'N/A';
    return String(cell.v).trim() || 'N/A';
}

// Process CSV data from JSONP
function processCSVJSONP(data) {
    // Assuming data is the raw CSV text
    return parseCSV(data);
}

// Parse CSV data with optimization for better performance
function parseCSV(csvText) {
    console.log('Parsing CSV data');
    updateLoadingMessage('Processing spreadsheet data...');
    const startTime = performance.now();
    
    const lines = csvText.split('\n');
    
    if (lines.length < 2) {
        console.error('Not enough lines in CSV data');
        return [];
    }
    
    const headers = lines[0].split(',').map(header => header.trim().replace(/^"|"$/g, ''));
    console.log('CSV Headers:', headers);
    
    // Find indices for our columns of interest
    const winnerIndex = headers.findIndex(h => h.toLowerCase().includes('winner') && !h.toLowerCase().includes('form'));
    const twitchIndex = headers.findIndex(h => h.toLowerCase().includes('twitch'));
    const discordIndex = headers.findIndex(h => h.toLowerCase().includes('discord'));
    const websiteIndex = headers.findIndex(h => h.toLowerCase().includes('website'));
    const giveawayIndex = headers.findIndex(h => h.toLowerCase().includes('giveaway') && !h.toLowerCase().includes('pictures'));
    const discountIndex = headers.findIndex(h => h.toLowerCase().includes('discount'));
    const shipsFromIndex = headers.findIndex(h => h.toLowerCase().includes('ships from') || h.toLowerCase().includes('where item ships from'));
    const shippingIndex = headers.findIndex(h => h.toLowerCase().includes('shipping') && !h.toLowerCase().includes('ships from'));
    const picturesIndex = headers.findIndex(h => h.toLowerCase().includes('giveaway pictures'));
    
    console.log('CSV column indices:', {
        winnerIndex,
        twitchIndex,
        discordIndex,
        websiteIndex,
        giveawayIndex,
        discountIndex,
        shipsFromIndex,
        shippingIndex,
        picturesIndex
    });
    
    if (winnerIndex === -1 || giveawayIndex === -1) {
        console.error('Required columns "Winner" or "Giveaway" not found in CSV');
    }
    
    // Estimate rows for progress updates
    const totalRows = lines.length - 1;
    const updateFrequency = Math.max(1, Math.floor(totalRows / 5)); // Update 5 times during processing
    
    // Parse data rows
    const data = [];
    let keywordCounter = {}; // Track occurrences of important keywords for debugging
    
    for (let i = 1; i < lines.length; i++) {
        // Show progress updates during parsing for large datasets
        if (i % updateFrequency === 0 || i === lines.length - 1) {
            const percent = Math.round((i / totalRows) * 100);
            updateLoadingMessage(`Processing data... ${percent}% (${i}/${totalRows} rows)`);
        }
        
        // Calculate the actual spreadsheet row number (header is row 1, data starts at row 2)
        const spreadsheetRowNumber = i + 1;
        
        if (!lines[i].trim()) {
            continue;
        }
        
        // Handle quoted fields with commas inside them
        const row = parseCSVRow(lines[i]);
        
        // Check if row is valid
        if (!row || row.length === 0) {
            continue;
        }
        
        // Extract key fields for more inclusive filtering - accept ANY content
        const rowData = {
            rowNumber: spreadsheetRowNumber, // Store the exact spreadsheet row number
            winner: (winnerIndex >= 0 && winnerIndex < row.length && row[winnerIndex]?.replace(/^"|"$/g, '')) || 'N/A',
            twitch: (twitchIndex >= 0 && twitchIndex < row.length && row[twitchIndex]?.replace(/^"|"$/g, '')) || 'N/A',
            discord: (discordIndex >= 0 && discordIndex < row.length && row[discordIndex]?.replace(/^"|"$/g, '')) || 'N/A',
            website: (websiteIndex >= 0 && websiteIndex < row.length && row[websiteIndex]?.replace(/^"|"$/g, '')) || 'N/A',
            giveaway: (giveawayIndex >= 0 && giveawayIndex < row.length && row[giveawayIndex]?.replace(/^"|"$/g, '')) || 'N/A',
            discount: (discountIndex >= 0 && discountIndex < row.length && row[discountIndex]?.replace(/^"|"$/g, '')) || 'N/A',
            shipsFrom: (shipsFromIndex >= 0 && shipsFromIndex < row.length && row[shipsFromIndex]?.replace(/^"|"$/g, '')) || 'N/A',
            shipping: (shippingIndex >= 0 && shippingIndex < row.length && row[shippingIndex]?.replace(/^"|"$/g, '')) || 'N/A',
            pictureUrl: (picturesIndex >= 0 && picturesIndex < row.length && row[picturesIndex]?.replace(/^"|"$/g, '')) || ''
        };
        
        // Only track keywords for the first few rows to avoid excessive logging
        if (i < 50) {
            // Track occurrences of keywords for debugging
            for (const [key, value] of Object.entries(rowData)) {
                if (typeof value === 'string') {
                    const lowerValue = value.toLowerCase();
                    // Track occurrences of specific keywords
                    const keywordsToTrack = ['techjeeper', 'boosted', 'spark'];
                    keywordsToTrack.forEach(keyword => {
                        if (lowerValue.includes(keyword)) {
                            keywordCounter[keyword] = (keywordCounter[keyword] || 0) + 1;
                            console.log(`CSV: Found "${keyword}" in row ${spreadsheetRowNumber}, field: ${key}, value: ${value}`);
                        }
                    });
                }
            }
        }
        
        // Keep all rows with actual content (don't filter out N/A)
        // Only skip completely empty rows
        if (row.some(cell => cell && cell.trim && cell.trim() !== '')) {
            data.push(rowData);
        }
    }
    
    console.log('CSV Keyword counter:', keywordCounter);
    console.log(`Total CSV rows loaded: ${data.length}`);
    
    // Log parsing performance
    const parseTime = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`CSV parsing completed in ${parseTime} seconds`);
    
    return data;
}

// Parse a CSV row handling quoted fields with commas
function parseCSVRow(line) {
    const result = [];
    let inQuotes = false;
    let currentField = '';
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(currentField);
            currentField = '';
        } else {
            currentField += char;
        }
    }
    
    result.push(currentField);
    return result;
}

// Set table loading state
function setTableLoading(isLoading, isInitialLoad = false) {
    const tableContainer = document.querySelector('.table-container');
    
    // Remove existing overlay if any
    const existingOverlay = document.querySelector('.table-loading-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    if (isLoading) {
        // Add loading classes and create overlay
        tableContainer.classList.add('table-loading');
        
        // Add additional class for initial loading
        if (isInitialLoad) {
            tableContainer.classList.add('initial-loading');
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'table-loading-overlay';
        
        const spinner = document.createElement('div');
        spinner.className = 'table-spinner';
        
        overlay.appendChild(spinner);
        tableContainer.appendChild(overlay);
    } else {
        // Remove loading classes
        tableContainer.classList.remove('table-loading');
        tableContainer.classList.remove('initial-loading');
    }
}

// Display giveaways in a table format
function displayGiveaways(giveaways) {
    // For initial load (during app initialization), we want to proceed differently
    // Use a flag to determine if this is the first display after app startup
    const isFirstLoad = !window.hasDisplayedData;
    
    // Set table to loading state before updating, with more blur for initial load
    setTableLoading(true, isFirstLoad);
    
    // Clear the current table rows
    const tableBody = giveawaysTable.querySelector('tbody');
    tableBody.innerHTML = '';
    
    if (giveaways.length === 0) {
        // Show no results message and hide the table
        giveawaysTable.style.display = 'none';
        noResultsElement.style.display = 'block';
        setTableLoading(false);
        return;
    }
    
    // Hide no results message and show the table
    giveawaysTable.style.display = 'table';
    noResultsElement.style.display = 'none';
    
    console.log(`Displaying ${giveaways.length} giveaways in table format`);
    
    // Sort giveaways by rowNumber to ensure they appear in sheet order
    giveaways.sort((a, b) => {
        // If rowNumber is missing, use a very high number to sort them to the end
        const aRow = a.rowNumber || 9999;
        const bRow = b.rowNumber || 9999;
        return aRow - bRow;
    });
    
    // Keep track of the first available row
    let firstAvailableRow = null;
    let firstAvailableRowIndex = -1;
    
    // Add each giveaway as a row in the table
    giveaways.forEach((giveaway, index) => {
        const row = document.createElement('tr');
        
        // Normalize winner field for consistent checking (handle capitalization, whitespace)
        const normalizedWinner = giveaway.winner ? giveaway.winner.trim().toUpperCase() : '';
        
        // Check if this is an available giveaway:
        // 1. Winner must be "N/A" or empty
        // 2. Giveaway must have a meaningful value (not blank/N/A)
        const hasWinner = normalizedWinner && normalizedWinner !== 'N/A';
        const hasGiveaway = giveaway.giveaway && 
                           giveaway.giveaway.trim().toUpperCase() !== 'N/A' && 
                           giveaway.giveaway.trim() !== '';
        
        const isAvailable = !hasWinner && hasGiveaway;
        
        if (index < 10) {
            console.log(`Row ${index+1} (Sheet row ${giveaway.rowNumber || '?'}): ` +
                        `Available=${isAvailable}, Winner="${giveaway.winner}", ` +
                        `Giveaway="${giveaway.giveaway}"`);
        }
        
        // Add class for completed giveaways
        if (!isAvailable) {
            row.classList.add('completed-giveaway');
        } else if (firstAvailableRow === null) {
            // This is the first available giveaway with actual content
            row.classList.add('first-available');
            firstAvailableRow = row;
            firstAvailableRowIndex = index;
            console.log(`Found first available row at index ${index} (Sheet row ${giveaway.rowNumber}): ` +
                        `Winner="${giveaway.winner}", Giveaway="${giveaway.giveaway}"`);
        }
        
        // Row number column - always use the original spreadsheet row number
        const rowNumCell = document.createElement('td');
        rowNumCell.textContent = giveaway.rowNumber || (index + 1);
        rowNumCell.style.fontWeight = 'bold';
        rowNumCell.style.textAlign = 'center';
        row.appendChild(rowNumCell);
        
        // Winner column
        const winnerCell = document.createElement('td');
        winnerCell.textContent = giveaway.winner;
        row.appendChild(winnerCell);
        
        // Twitch Name column
        const twitchCell = document.createElement('td');
        twitchCell.textContent = giveaway.twitch;
        row.appendChild(twitchCell);
        
        // Discord Name column
        const discordCell = document.createElement('td');
        discordCell.textContent = giveaway.discord;
        row.appendChild(discordCell);
        
        // Website column - use an icon instead of the full URL
        const websiteCell = document.createElement('td');
        if (giveaway.website && giveaway.website !== 'N/A') {
            const link = document.createElement('a');
            link.href = giveaway.website.startsWith('http') ? giveaway.website : `https://${giveaway.website}`;
            link.title = giveaway.website; // Show the URL in a tooltip
            link.className = 'website-icon';
            link.target = '_blank';
            // Use Font Awesome icon
            const icon = document.createElement('i');
            icon.className = 'fas fa-link';
            link.appendChild(icon);
            websiteCell.appendChild(link);
        } else {
            websiteCell.textContent = '';
        }
        row.appendChild(websiteCell);
        
        // Giveaway column
        const giveawayCell = document.createElement('td');
        giveawayCell.textContent = giveaway.giveaway;
        row.appendChild(giveawayCell);
        
        // Discount column
        const discountCell = document.createElement('td');
        discountCell.textContent = giveaway.discount || 'None';
        row.appendChild(discountCell);
        
        // Ships From column
        const shipsFromCell = document.createElement('td');
        shipsFromCell.textContent = giveaway.shipsFrom;
        row.appendChild(shipsFromCell);
        
        // Shipping column
        const shippingCell = document.createElement('td');
        shippingCell.textContent = giveaway.shipping;
        row.appendChild(shippingCell);
        
        // Pictures column - only show if there's a picture URL
        const picturesCell = document.createElement('td');
        if (giveaway.pictureUrl && giveaway.pictureUrl.trim() !== '') {
            const link = document.createElement('a');
            link.href = giveaway.pictureUrl;
            link.textContent = 'View';
            link.className = 'discord-link';
            link.target = '_blank';
            picturesCell.appendChild(link);
        } else {
            picturesCell.textContent = '';
        }
        row.appendChild(picturesCell);
        
        // Add the complete row to the table
        tableBody.appendChild(row);
    });
    
    window.hasDisplayedData = true;
    
    if (isFirstLoad) {
        // On first load, we immediately remove the table loading spinner to avoid double spinners
        setTableLoading(false);
        
        // Scroll to the first available row if there is one, after a delay
        if (firstAvailableRow) {
            console.log(`First load: Scrolling to first available row at index ${firstAvailableRowIndex}`);
            setTimeout(() => {
                firstAvailableRow.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }, 500);
        } else {
            console.log('No available row found to scroll to');
        }
    } else {
        // For subsequent loads (search/filter), use the original timing
        if (firstAvailableRow) {
            console.log(`Subsequent load: Scrolling to first available row at index ${firstAvailableRowIndex}`);
            // Use a small delay to ensure the table is fully rendered
            setTimeout(() => {
                firstAvailableRow.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                // Remove loading state after scrolling completes
                setTimeout(() => setTableLoading(false), 300);
            }, 500);
        } else {
            console.log('No available row found to scroll to');
            // Remove loading state with a small delay for visual feedback
            setTimeout(() => setTableLoading(false), 300);
        }
    }
}

// Show error message
function showError(message) {
    const errorElement = document.createElement('p');
    errorElement.className = 'error';
    errorElement.style.color = 'red';
    errorElement.style.fontWeight = 'bold';
    errorElement.textContent = message;
    
    // Clear existing content and add error
    loadingContainer.innerHTML = '';
    loadingContainer.appendChild(errorElement);
}

// Filter giveaways based on search term
function filterGiveaways(giveaways, searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') {
        console.log('Search cleared, showing all rows:', giveaways.length);
        return giveaways;
    }
    
    searchTerm = searchTerm.toLowerCase();
    console.log(`Filtering using search term: "${searchTerm}"`);
    
    // For debugging: find all occurrences of the search term across all rows and fields
    if (searchTerm === 'techjeeper' || searchTerm === 'boosted' || searchTerm === 'spark') {
        console.log(`DEBUG: Searching for all "${searchTerm}" instances:`);
        giveaways.forEach((giveaway, idx) => {
            for (const [key, value] of Object.entries(giveaway)) {
                if (typeof value === 'string' && value.toLowerCase().includes(searchTerm)) {
                    console.log(`Row ${giveaway.rowNumber}: Found in ${key} = "${value}"`);
                }
            }
        });
    }
    
    const filtered = giveaways.filter(giveaway => {
        // Check all fields including row number
        const isMatch = 
            (giveaway.rowNumber && giveaway.rowNumber.toString().includes(searchTerm)) ||
            (giveaway.winner && giveaway.winner.toLowerCase().includes(searchTerm)) ||
            (giveaway.twitch && giveaway.twitch.toLowerCase().includes(searchTerm)) ||
            (giveaway.discord && giveaway.discord.toLowerCase().includes(searchTerm)) ||
            (giveaway.website && giveaway.website.toLowerCase().includes(searchTerm)) ||
            (giveaway.giveaway && giveaway.giveaway.toLowerCase().includes(searchTerm)) ||
            (giveaway.discount && giveaway.discount.toLowerCase().includes(searchTerm)) ||
            (giveaway.shipsFrom && giveaway.shipsFrom.toLowerCase().includes(searchTerm)) ||
            (giveaway.shipping && giveaway.shipping.toLowerCase().includes(searchTerm)) ||
            (giveaway.pictureUrl && giveaway.pictureUrl.toLowerCase().includes(searchTerm));
        
        // For specific search terms of interest, log matches
        if ((searchTerm === 'techjeeper' || searchTerm === 'boosted' || searchTerm === 'spark') && isMatch) {
            console.log(`Search Match - Row ${giveaway.rowNumber}: Winner="${giveaway.winner}", Giveaway="${giveaway.giveaway}"`);
        }
        
        return isMatch;
    });
    
    console.log(`Found ${filtered.length} matches for "${searchTerm}"`);
    return filtered;
}

// Initialize the app
async function initApp() {
    console.log('Initializing app...');
    console.log(`Using Google Sheet ID: ${SHEET_ID}`);
    
    // Update the sheet link href
    const sheetLink = document.getElementById('sheet-link');
    if (sheetLink) {
        sheetLink.href = SHEET_URL;
    }
    
    // Main loading indicator is sufficient for initial load
    // Don't set table loading state here
    
    try {
        // Show more detailed loading status
        updateLoadingMessage('Starting data fetch process...');
        
        // Get data with progress updates
        const startTime = performance.now();
        let giveaways = await fetchSheetData();
        const loadTime = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`Fetched ${giveaways.length} giveaways from the sheet in ${loadTime} seconds`);
        
        // Calculate initial checksum for auto-update feature
        lastDataChecksum = calculateDataChecksum(giveaways);
        console.log('Initial data checksum calculated:', lastDataChecksum);
        
        // Store original data in a global variable to ensure we always have the full dataset
        window.allGiveaways = [...giveaways];
        
        // Print some diagnostics about row numbers
        if (giveaways.length > 0) {
            console.log('Row number diagnostics:');
            
            // Print row info for some rows
            const rowsToPrint = giveaways.filter((giveaway, index) => {
                // Print first 5 rows, rows with interesting content, and any row near 201
                return index < 5 || 
                       (giveaway.winner === 'N/A' && index < 15) || 
                       (giveaway.rowNumber >= 198 && giveaway.rowNumber <= 208);
            });
            
            rowsToPrint.forEach((giveaway) => {
                console.log(`Sheet row ${giveaway.rowNumber}: Winner="${giveaway.winner}", Giveaway="${giveaway.giveaway}"`);
            });
            
            // Find first available row
            const firstAvailable = giveaways.find(g => 
                (g.winner === 'N/A' || !g.winner) && 
                g.giveaway && g.giveaway !== 'N/A');
                
            if (firstAvailable) {
                console.log('First available row found:');
                console.log(`Sheet row: ${firstAvailable.rowNumber}, Winner: ${firstAvailable.winner}, Giveaway: ${firstAvailable.giveaway}`);
            } else {
                console.log('No available rows found');
            }
        }
        
        // Hide loading indicator before displaying giveaways
        loadingContainer.style.display = 'none';
        
        // Display giveaways initially
        displayGiveaways(giveaways);
        
        // Add a clear button for the search field for better UX
        const searchContainer = searchInput.parentElement;
        const clearButton = document.createElement('button');
        clearButton.innerHTML = '&times;';
        clearButton.className = 'search-clear-btn';
        clearButton.title = 'Clear search';
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            handleSearch();
            searchInput.focus();
        });
        searchContainer.appendChild(clearButton);
        
        // Set up search functionality
        function handleSearch() {
            const searchValue = searchInput.value.trim();
            console.log(`Search value: "${searchValue}", length: ${searchValue.length}`);
            
            // Show loading state while filtering
            setTableLoading(true);
            
            // Toggle clear button visibility
            if (searchValue === '') {
                clearButton.classList.add('hidden');
            } else {
                clearButton.classList.remove('hidden');
            }
            
            // IMPORTANT: Always use the complete original dataset
            let dataset = window.allGiveaways;
            console.log(`Using complete dataset with ${dataset.length} rows`);
            
            // If search is empty, show all results
            if (searchValue === '') {
                console.log(`Search is empty, showing all ${dataset.length} results`);
                displayGiveaways(dataset);
                return;
            }
            
            // Otherwise filter the results
            const filteredGiveaways = filterGiveaways(dataset, searchValue);
            displayGiveaways(filteredGiveaways);
        }
        
        // Initialize clear button visibility
        if (!searchInput.value.trim()) {
            clearButton.classList.add('hidden');
        }
        
        // Set up event listeners for search
        searchInput.addEventListener('input', handleSearch);
        searchInput.addEventListener('change', handleSearch);
        
        // More reliable handling of different input methods
        searchInput.addEventListener('paste', () => setTimeout(handleSearch, 100));
        searchInput.addEventListener('cut', () => setTimeout(handleSearch, 100));
        
        // Handle Escape key for clearing search
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                handleSearch();
            }
        });
        
        // Add a refresh button to force reload all data
        const refreshButton = document.createElement('button');
        refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
        refreshButton.className = 'refresh-btn';
        refreshButton.title = 'Refresh data';
        
        // Create auto-update checkbox container and elements
        const autoUpdateContainer = document.createElement('div');
        autoUpdateContainer.className = 'auto-update-container';
        
        const autoUpdateCheckbox = document.createElement('input');
        autoUpdateCheckbox.type = 'checkbox';
        autoUpdateCheckbox.id = 'auto-update';
        autoUpdateCheckbox.className = 'auto-update-checkbox';
        
        const autoUpdateLabel = document.createElement('label');
        autoUpdateLabel.htmlFor = 'auto-update';
        autoUpdateLabel.textContent = 'Auto Update';
        
        autoUpdateContainer.appendChild(autoUpdateCheckbox);
        autoUpdateContainer.appendChild(autoUpdateLabel);
        
        // Check localStorage for saved preference
        const savedAutoUpdate = localStorage.getItem('autoUpdateEnabled');
        if (savedAutoUpdate === 'true') {
            autoUpdateCheckbox.checked = true;
            startAutoUpdate();
        }
        
        // Add event listener to checkbox for toggling auto-update
        autoUpdateCheckbox.addEventListener('change', function() {
            if (this.checked) {
                startAutoUpdate();
                localStorage.setItem('autoUpdateEnabled', 'true');
            } else {
                stopAutoUpdate();
                localStorage.setItem('autoUpdateEnabled', 'false');
            }
        });
        
        refreshButton.addEventListener('click', async () => {
            // Show loading state on the button and table
            refreshButton.disabled = true;
            refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            // Apply a strong blur effect for refresh
            setTableLoading(true, true);
            
            try {
                // Clear search first
                searchInput.value = '';
                clearButton.classList.add('hidden');
                
                // Show a loading message
                updateLoadingMessage('Refreshing data from spreadsheet...');
                
                // Refetch data
                const freshData = await fetchSheetData();
                
                // Update the checksum for auto-update
                lastDataChecksum = calculateDataChecksum(freshData);
                
                // Update the global dataset and display
                window.allGiveaways = [...freshData];
                console.log(`Refreshed data: ${freshData.length} rows loaded`);
                
                // Display all rows
                displayGiveaways(freshData);
                
                // Reset button state
                refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
                refreshButton.disabled = false;
            } catch (error) {
                console.error('Refresh failed:', error);
                refreshButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                setTimeout(() => {
                    refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
                    refreshButton.disabled = false;
                    setTableLoading(false);
                }, 2000);
            }
        });
        
        // Add refresh button and auto-update checkbox to container
        const refreshContainer = document.createElement('div');
        refreshContainer.className = 'refresh-container';
        refreshContainer.appendChild(autoUpdateContainer);
        refreshContainer.appendChild(refreshButton);
        document.querySelector('.filter-container').appendChild(refreshContainer);
        
        // Add scroll indicator for table
        setupTableScrollIndicator();
    } catch (error) {
        console.error('Error in app initialization:', error);
        showError(`App initialization failed: ${error.message}`);
        setTableLoading(false);
    }
}

// Add visual cue for scrollable table
function setupTableScrollIndicator() {
    const tableContainer = document.querySelector('.table-container');
    
    // Check if there's anything to scroll
    function updateScrollIndicator() {
        // Check if content exceeds container
        const hasVerticalScroll = tableContainer.scrollHeight > tableContainer.clientHeight;
        const hasHorizontalScroll = tableContainer.scrollWidth > tableContainer.clientWidth;
        
        if (hasVerticalScroll || hasHorizontalScroll) {
            tableContainer.classList.add('scrollable');
            
            // Add scroll hint if not already present
            if (!document.querySelector('.scroll-hint')) {
                const scrollHint = document.createElement('div');
                scrollHint.className = 'scroll-hint';
                scrollHint.innerHTML = '<span>Scroll to see more</span>';
                document.querySelector('.filter-container').appendChild(scrollHint);
                
                // Fade out scroll hint after user has scrolled
                tableContainer.addEventListener('scroll', function() {
                    scrollHint.classList.add('fade-out');
                    setTimeout(() => {
                        scrollHint.remove();
                    }, 500);
                }, { once: true });
            }
        } else {
            tableContainer.classList.remove('scrollable');
            const scrollHint = document.querySelector('.scroll-hint');
            if (scrollHint) scrollHint.remove();
        }
    }
    
    // Run initially
    updateScrollIndicator();
    
    // Update on window resize
    window.addEventListener('resize', updateScrollIndicator);
}

// Calculate a simple checksum of the data to detect changes
function calculateDataChecksum(data) {
    if (!data || data.length === 0) return '';
    
    // Create a string with relevant data for the first 10 rows (enough to detect most changes)
    // This is more efficient than checking the entire dataset
    const sampleSize = Math.min(data.length, 10);
    let checksumString = '';
    
    for (let i = 0; i < sampleSize; i++) {
        const row = data[i];
        checksumString += `${row.winner}|${row.giveaway}|${row.twitch}|${row.discord}|`;
    }
    
    // Add the total number of rows to catch additions/deletions
    checksumString += `total:${data.length}`;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < checksumString.length; i++) {
        const char = checksumString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString();
}

// Start auto-update interval
function startAutoUpdate() {
    // Clear any existing interval
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
    }
    
    // Set new interval
    autoUpdateInterval = setInterval(async () => {
        if (document.hidden) {
            // Don't auto-update when the tab is not visible
            console.log('Skipping auto-update check: tab not visible');
            return;
        }
        
        console.log('Running auto-update check...');
        try {
            // Fetch data without showing loading indicators
            const freshData = await fetchSheetData(true);
            const newChecksum = calculateDataChecksum(freshData);
            
            // Compare checksums to see if data changed
            if (newChecksum !== lastDataChecksum && lastDataChecksum !== '') {
                console.log('Data change detected, refreshing...');
                
                // Show subtle loading indication
                setTableLoading(true);
                
                // Update the global dataset and display
                window.allGiveaways = [...freshData];
                console.log(`Auto-refreshed data: ${freshData.length} rows loaded`);
                
                // Display all rows (or filtered if search is active)
                const searchValue = searchInput.value.trim();
                if (searchValue === '') {
                    displayGiveaways(freshData);
                } else {
                    displayGiveaways(filterGiveaways(freshData, searchValue));
                }
                
                // Flash the refresh button to indicate auto-update happened
                const refreshButton = document.querySelector('.refresh-btn');
                refreshButton.classList.add('auto-updated');
                setTimeout(() => {
                    refreshButton.classList.remove('auto-updated');
                }, 1000);
            } else {
                console.log('No data changes detected');
            }
            
            // Update checksum
            lastDataChecksum = newChecksum;
        } catch (error) {
            console.error('Auto-update check failed:', error);
        }
    }, AUTO_UPDATE_INTERVAL_MS);
    
    console.log('Auto-update started: checking every', AUTO_UPDATE_INTERVAL_MS / 1000, 'seconds');
}

// Stop auto-update interval
function stopAutoUpdate() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
        console.log('Auto-update stopped');
    }
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp); 