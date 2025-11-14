# DealMachine Contacts - Cold Calling Setup

## Quick Start

1. **Convert CSV to JSON**
   ```bash
   node convert-contacts.js
   ```
   This creates:
   - `contacts.json` - Your contact database (330 contacts across 124 properties)
   - `contacted.json` - Tracking file for who you've called

2. **Run batch calling**
   ```bash
   # Call 1 contact (default)
   node batch-caller.js
   
   # Call 5 contacts in this session
   node batch-caller.js 5
   
   # Call 10 contacts
   node batch-caller.js 10
   ```
   
   The batch caller will:
   - Load uncontacted people from contacts.json
   - Call them using your existing cold-caller script
   - Automatically mark them as contacted
   - Stop after the batch size (so you can run in sessions)
   - Skip properties where everyone has been called

3. **Monitor progress**
   - Each call is logged to the console
   - contacted.json is updated after each call
   - Stop anytime with Ctrl+C (progress is saved)
   - Resume later by running batch-caller.js again

4. **View call history**
   ```bash
   # View all call attempts
   node view-call-history.js
   
   # View only successfully reached contacts
   node view-call-history.js reached
   
   # View only pending contacts (need more attempts)
   node view-call-history.js pending
   ```
   
   This shows:
   - Contact names and properties
   - All phone numbers tried
   - Call outcomes for each attempt
   - Vapi call IDs and dashboard links
   - Timestamps for every call

## File Structure

### contacts.json
Organized by property address with all associated contacts:

```json
{
  "1423 Allendale Rd, West Palm Beach, Fl 33405": {
    "property_address": "1423 Allendale Rd, West Palm Beach, Fl 33405",
    "contacts": [
      {
        "contact_id": "15035907117",
        "name": "Donald Novell F",
        "mailing_address": "106 FLAGLER PROMENADE N, WEST PALM BEACH, FL, 33405",
        "emails": ["DONALDNOVELL@GMAIL.COM"],
        "phones": [
          {
            "number": "5618333899",
            "type": "Landline",
            "do_not_call": true,
            "status": "Inactive monthly for 2 months",
            "carrier": "AT&T Local",
            "usage_2_months": "No data available or no usage in the last 2 months",
            "usage_12_months": "Light Usage"
          }
        ],
        "flags": "Likely Owner",
        "gender": "Male",
        "language": "",
        "occupation": "Sales",
        "business_owner": true
      }
    ]
  }
}
```

### contacted.json
Detailed tracking with call history and outcomes:

```json
{
  "15035907117": {
    "attempts": [
      {
        "timestamp": "2025-11-13T18:30:00Z",
        "phone": "5618333899",
        "outcome": "voicemail",
        "vapiCallId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "vapiDashboardUrl": "https://dashboard.vapi.ai/calls/a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      },
      {
        "timestamp": "2025-11-13T18:32:00Z",
        "phone": "5618373352",
        "outcome": "answered",
        "vapiCallId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "vapiDashboardUrl": "https://dashboard.vapi.ai/calls/b2c3d4e5-f6a7-8901-bcde-f12345678901"
      }
    ],
    "status": "reached",
    "lastAttempt": "2025-11-13T18:32:00Z"
  },
  "15038530357": {
    "attempts": [
      {
        "timestamp": "2025-11-13T18:35:00Z",
        "phone": "5616865290",
        "outcome": "no_answer",
        "vapiCallId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
        "vapiDashboardUrl": "https://dashboard.vapi.ai/calls/c3d4e5f6-a7b8-9012-cdef-123456789012"
      }
    ],
    "status": "pending",
    "lastAttempt": "2025-11-13T18:35:00Z"
  }
}
```

**Status values:**
- `reached` - Successfully spoke with someone, won't retry
- `pending` - Tried but didn't reach (voicemail/no answer), will retry with other numbers

**Outcome values:**
- `answered` - Spoke with person (success!)
- `voicemail` - Left voicemail message
- `no_answer` - Rang but no pickup
- `busy` - Busy signal
- `invalid_number` - Number doesn't work
- `failed` - Technical failure

## Usage Tips

### Reviewing Call Recordings
Each call attempt stores the Vapi call ID and dashboard URL:

```javascript
// Load contacted.json to see all calls
const contacted = JSON.parse(fs.readFileSync('contacted.json', 'utf8'));

// Get all Vapi call IDs for a contact
const contact = contacted['15035907117'];
contact.attempts.forEach(attempt => {
  console.log(`Call on ${attempt.timestamp}:`);
  console.log(`  Phone: ${attempt.phone}`);
  console.log(`  Outcome: ${attempt.outcome}`);
  console.log(`  Review: ${attempt.vapiDashboardUrl}`);
});
```

You can click the `vapiDashboardUrl` to:
- Listen to call recordings
- View transcripts
- Check call duration
- See voicemail detection results
- Review analytics

### Marking Contacts as Called
The batch caller automatically records attempts, but you can manually update if needed:

```javascript
// In your cold caller script
const contacted = JSON.parse(fs.readFileSync('contacted.json', 'utf8'));
contacted[contactId] = true;
fs.writeFileSync('contacted.json', JSON.stringify(contacted, null, 2));
```

### Filtering Uncontacted
```javascript
const contacts = JSON.parse(fs.readFileSync('contacts.json', 'utf8'));
const contacted = JSON.parse(fs.readFileSync('contacted.json', 'utf8'));

for (const [address, data] of Object.entries(contacts)) {
  const uncontactedPeople = data.contacts.filter(
    contact => !contacted[contact.contact_id]
  );
  // Process uncontacted people...
}
```

### Phone Number Selection
The batch caller automatically picks the best phone number using this priority:
1. **Not flagged do-not-call** (+100 points)
2. **Active for 12 months or longer** (+50 points)
3. **Heavy usage** (+20 points)
4. **Wireless over Landline** (+5 points)

Phone fields available:
- `number` - The actual phone number
- `do_not_call` - Boolean flag (batch caller warns but still shows)
- `status` - Activity status (e.g., "Active for 12 months or longer")
- `type` - Landline, Wireless, etc.
- `usage_12_months` - "Heavy Usage", "Moderate Usage", etc.
- `carrier` - Phone carrier info

### Resetting
To start over with calling:
```bash
rm contacted.json
node convert-contacts.js
```

This preserves your contact data but clears the contacted tracking.

## Statistics
From the current CSV:
- **124 property addresses**
- **330 total contacts**
- **Multiple contacts per property** - great for finding decision makers

## Integration with Cold Caller

Your cold caller script should:
1. Load `contacts.json`
2. Load `contacted.json`
3. For each property address:
   - Filter out already contacted people
   - Try each phone number for remaining contacts
   - Mark contact as called in `contacted.json` after successful call
4. Save `contacted.json` after each batch

This way if you stop/restart, you won't call the same people twice.

