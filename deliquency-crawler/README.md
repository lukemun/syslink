# Delinquent Tax Lead Uploader for DealMachine

This set of scripts processes delinquent tax data and uploads it as leads to DealMachine.

## Setup

### 1. Create Virtual Environment

```bash
cd deliquency-crawler
python3 -m venv venv
source venv/bin/activate
```

Or use the setup script:

```bash
chmod +x setup_and_run.sh
./setup_and_run.sh
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure API Key

Create a `.env` file in the **project root** (syslink/):

```bash
# In /Users/lukemunro/Clones/syslink/.env
DEALMACHINE_API_KEY=your_actual_api_key_here
```

To get your DealMachine API key:
1. Log into your DealMachine account
2. Click on your profile picture (top right)
3. Go to **Application Settings** > **API**
4. Copy your API key

## Usage

### Step 1: Deduplicate the Data

First, run the deduplication script to consolidate duplicate entries:

```bash
python deduplicate.py
```

This creates `delinquent_taxes_deduplicated.json` with:
- Combined entries by owner name and address
- Warrant numbers as a list
- Total warrant amounts summed up

### Step 2: Upload Leads to DealMachine

#### Basic Usage

```bash
# Process first 10 leads (default)
python add_leads_to_dealmachine.py

# Test with just 1 lead
python add_leads_to_dealmachine.py --max-leads 1

# Process 50 leads
python add_leads_to_dealmachine.py --max-leads 50

# Process ALL leads
python add_leads_to_dealmachine.py --max-leads all
```

#### Advanced Options

```bash
# Custom input file
python add_leads_to_dealmachine.py --input my_leads.json

# Custom output file
python add_leads_to_dealmachine.py --output my_responses.json

# Adjust delay between requests (in seconds)
python add_leads_to_dealmachine.py --max-leads 100 --delay 2

# Combine all options
python add_leads_to_dealmachine.py \
  --max-leads 100 \
  --input custom_leads.json \
  --output results.json \
  --delay 0.5
```

#### Get Help

```bash
python add_leads_to_dealmachine.py --help
```

## Output

The script creates `dealmachine_responses.json` (or your custom output file) containing:
- Summary of successful/failed uploads
- Full API responses for each lead
- Original lead data for reference

Example output structure:

```json
{
  "summary": {
    "total_processed": 50,
    "successful": 48,
    "failed": 2,
    "timestamp": "2025-11-13T10:30:00"
  },
  "responses": [
    {
      "index": 1,
      "original_entry": {...},
      "formatted_lead": {...},
      "status_code": 200,
      "response": {...},
      "success": true
    }
  ]
}
```

## Files

- `deduplicate.py` - Deduplicates raw tax data
- `add_leads_to_dealmachine.py` - Uploads leads to DealMachine API
- `requirements.txt` - Python dependencies
- `setup_and_run.sh` - Setup helper script
- `env.example` - Example .env file template
- `delinquent_taxes.json` - Raw parsed data (input)
- `delinquent_taxes_deduplicated.json` - Deduplicated data
- `dealmachine_responses.json` - API responses (output)

## Tips

- **Start small**: Test with 1-5 leads first to verify everything works
- **Rate limiting**: Use `--delay` to avoid overwhelming the API
- **Monitor responses**: Check the output JSON for any failed uploads
- **Dry run**: If no API key is set, the script shows what would be sent without making actual API calls

