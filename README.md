# LinkedIn Profile URL Enrichement

This recipe demonstrates how to enrich a list of user profiles with their LinkedIn profile URLs using Airtop. It takes a CSV file containing email addresses and names, searches for each person on Google, and extracts their LinkedIn profile URL from the search results.

## Prerequisites

- Node.js installed
- An Airtop API key
- Input CSV file with columns: email, first_name, last_name

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with your Airtop API key.
   ```
   cp .env.example .env
   ```
4. Place your input CSV file in the `data` directory as `profiles.csv` (one has been provided as an example)

## Usage

Run the script:
```
npm start
```