#!/usr/bin/env python3
"""
Script to fetch Google Sheet data and save it as a JSON file.
This can be run periodically to update the data file.
"""

import csv
import json
import os
import sys
import requests
from datetime import datetime

# Google Sheet ID
SHEET_ID = '1pM8fMy2IVe_Sj1mBieFpMxO_to0Z6GDcirbUUZwCT9E'

def fetch_sheet_as_csv():
    """
    Fetch the Google Sheet as CSV data
    """
    csv_url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv"
    response = requests.get(csv_url)
    
    if response.status_code != 200:
        print(f"Error fetching sheet: {response.status_code}")
        sys.exit(1)
        
    return response.text

def parse_csv_data(csv_data):
    """
    Parse the CSV data into a list of dictionaries
    """
    lines = csv_data.splitlines()
    reader = csv.reader(lines)
    
    headers = next(reader)
    
    # Find indices for our columns of interest
    column_indices = {
        'winner': next((i for i, h in enumerate(headers) if 'winner' in h.lower() and 'form' not in h.lower()), -1),
        'twitch': next((i for i, h in enumerate(headers) if 'twitch' in h.lower()), -1),
        'discord': next((i for i, h in enumerate(headers) if 'discord' in h.lower()), -1),
        'website': next((i for i, h in enumerate(headers) if 'website' in h.lower()), -1),
        'giveaway': next((i for i, h in enumerate(headers) if 'giveaway' in h.lower() and 'pictures' not in h.lower()), -1),
        'discount': next((i for i, h in enumerate(headers) if 'discount' in h.lower()), -1),
        'shipsFrom': next((i for i, h in enumerate(headers) if 'ships from' in h.lower() or 'where item ships' in h.lower()), -1),
        'shipping': next((i for i, h in enumerate(headers) if 'shipping' in h.lower() and 'ships from' not in h.lower()), -1),
        'pictureUrl': next((i for i, h in enumerate(headers) if 'giveaway pictures' in h.lower()), -1)
    }
    
    print("Column indices:")
    for key, value in column_indices.items():
        print(f"  {key}: {value}")
    
    # Parse data rows
    data = []
    for row in reader:
        # Skip empty rows
        if not row or not any(row):
            continue
            
        # Only include rows with winner and giveaway
        if (column_indices['winner'] >= 0 and column_indices['winner'] < len(row) and row[column_indices['winner']] and
            column_indices['giveaway'] >= 0 and column_indices['giveaway'] < len(row) and row[column_indices['giveaway']]):
            
            item = {}
            for key, index in column_indices.items():
                if index >= 0 and index < len(row):
                    item[key] = row[index] or 'N/A'
                else:
                    item[key] = 'N/A'
            
            data.append(item)
    
    return data

def main():
    """
    Main function to fetch data and save as JSON
    """
    print(f"Fetching Google Sheet data for ID: {SHEET_ID}")
    
    try:
        csv_data = fetch_sheet_as_csv()
        parsed_data = parse_csv_data(csv_data)
        
        # Create output directory if it doesn't exist
        os.makedirs('data', exist_ok=True)
        
        # Save data to JSON file
        output_file = 'data/giveaways.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump({
                'lastUpdated': datetime.now().isoformat(),
                'data': parsed_data
            }, f, indent=2)
        
        print(f"Successfully saved {len(parsed_data)} items to {output_file}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 