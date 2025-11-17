# Florida Cash Home Buyers - Cold Caller Script

TypeScript script to make outbound calls using Vapi with dynamic variables for the cold-caller assistant.

## Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Configure environment variables:**

Add `VAPI_API_KEY` to `/Users/lukemunro/Clones/syslink/.env`:

```bash
# In /Users/lukemunro/Clones/syslink/.env
VAPI_API_KEY=your_vapi_api_key_here
```

The script uses these defaults (can be overridden with env vars):
- `VAPI_PHONE_NUMBER_ID` - Default: `+12393996085` (239) 399-6085
- `VAPI_ASSISTANT_ID` - Default: `9f56ad7a-9975-4e7b-ad51-13e7fb509ded`
- `TARGET_PHONE_NUMBER` - Default: `+16504006400` (650) 400-6400

## Usage

### Make a Call with Default Variables

```bash
npm run call
```

This will call `+16504006400` with the default variable values from `.env`.

### Customize Variables

Edit the `.env` file to customize the call:

```env
# Target number to call
TARGET_PHONE_NUMBER=+16504006400

# Agent and closer info
AGENT_NAME=Sarah
CLOSER_NAME=Michael Rodriguez

# Property details
PROPERTY_ADDRESS=456 Oak Avenue, Tampa, FL 33602
PROPERTY_CITY=Tampa

# Lead info
FIRST_NAME=John
USER_NUMBER=+15551234567

# Suggested callback times
TIME1=2:00 PM
TIME2=4:30 PM
```

## Dynamic Variables

The script passes the following variables to the Vapi assistant (see [Vapi docs](https://docs.vapi.ai/assistants/dynamic-variables)):

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_NAME` | Your agent's name | Sarah |
| `CLOSER_NAME` | Local acquisitions manager name | Michael Rodriguez |
| `PROPERTY_ADDRESS` | Full property address | 123 Main Street, Miami, FL 33101 |
| `PROPERTY_CITY` | City where property is located | Miami |
| `FIRST_NAME` | Homeowner's first name | Homeowner |
| `USER_NUMBER` | Homeowner's phone number | +15551234567 |
| `TIME1` | First suggested callback time | 2:00 PM |
| `TIME2` | Second suggested callback time | 4:30 PM |

### Default Vapi Variables

These are automatically available without configuration:
- `{{now}}` - Current date and time (UTC)
- `{{date}}` - Current date
- `{{time}}` - Current time
- `{{customer.number}}` - Customer's phone number

## Voicemail Detection

The script includes automatic voicemail detection configured with:
- **Provider**: Vapi (recommended for best speed/accuracy balance)
- **Detection timing**: Starts at 2 seconds, checks every 2.5 seconds
- **Max retries**: 5 attempts
- **Beep wait time**: 25 seconds (allows voicemail greeting to finish)

When voicemail is detected, the agent leaves a concise message:
> "Hi, this is [Agent Name] with Florida Cash Home Buyers. I was calling about the property at [Property Address]. We'd like to speak with you about a potential offer. Please give us a callback at [Target Number]. Again, that's [Target Number]. Thanks, and have a great day."

For more details, see [Vapi Voicemail Detection docs](https://docs.vapi.ai/calls/voicemail-detection).

## Call Monitoring

After initiating a call, the script will output:
- Call ID
- Call status
- Dashboard link for monitoring

Monitor all calls at: [dashboard.vapi.ai/calls](https://dashboard.vapi.ai/calls)

## Call Outcome Handling

`fetch-call-results.js` normalizes every Vapi `endedReason` into one of our internal outcomes, updates `contacted.json`, and `batch-caller.js` then decides what to do during the next wave. The diagram below shows the flow.

```
Call attempt
   |
   v
fetch-call-results.js (map outcome)
   |
   +--> answered  ----> mark contact reached ---> skip property next wave
   |
   +--> voicemail/no_answer/busy ---> contact pending ---> try next number
   |
   +--> failed  ----> keep same number eligible (transport error)
   |
   +--> in_progress ---> leave property on hold until results fetched
```

| Vapi signal | Internal outcome | Next-wave behavior |
|-------------|------------------|--------------------|
| `status=queued/ringing/in-progress` | `in_progress` | Property is skipped until we fetch results again. |
| `endedReason` `assistant-ended-call`, `customer-ended-call`, `assistant-said-end-call-phrase`, or >10 s call duration | `answered` | Contact marked `reached`; property is considered handled and skipped moving forward. |
| `endedReason` `voicemail` or voicemail detected in assistant messages | `voicemail` | Contact stays `pending`; next wave tries the next untried number for that contact. |
| `endedReason` `customer-did-not-answer`, `customer-did-not-give-microphone-permission`, `silence-timed-out`, or unknown end reason | `no_answer` | Contact stays `pending`; next wave tries the next untried number. |
| `endedReason` `customer-busy` | `busy` | Contact stays `pending`; next wave tries the next untried number. |
| `endedReason` `twilio-failed-to-connect-call` or `status=failed/error` | `failed` | Treated as transport errors: the same phone number remains eligible because `batch-caller` ignores `failed` attempts when tracking tried numbers. |

**Key behaviors**
- `contacted.json` is the source of truth; always run `node fetch-call-results.js` before starting a new wave so the latest outcomes influence retries.
- Contacts with any non-answered outcome remain `pending` until every phone number has been tried.
- `failed` attempts (e.g., Twilio connect issues) do **not** count against the phone number, so the next wave will retry the same number automatically.
- Once any contact for a property is marked `reached`, `batch-caller` stops scheduling that property altogether.

### Retrofix older silence timeouts

Before November 2025, calls that ended with Vapi's `silence-timed-out` reason could be misclassified as `answered` if they lasted longer than 10 seconds. Run the helper script below once to clean up legacy data so those contacts re-enter the dialing queue:

```bash
cd /Users/lukemunro/Clones/syslink/cold-caller
node retrofix-silence-timeout.js
```

Add `--dry-run` to preview changes without writing to `contacted.json`. The script re-fetches call details from Vapi, re-labels the affected attempts as `no_answer`, and automatically sets each contact back to `pending` so the next batch wave tries the next number.

## Troubleshooting

### Missing Environment Variables

```
❌ Missing required environment variables:
   - VAPI_API_KEY
```

**Solution:** Create a `.env` file with all required variables.

### Invalid Phone Number

Ensure phone numbers are in E.164 format:
- ✅ Correct: `+16504006400`
- ❌ Wrong: `6504006400`, `(650) 400-6400`

### Assistant Not Found

If you get an assistant not found error, verify:
1. The `VAPI_ASSISTANT_ID` in your `.env` file
2. The assistant exists in your Vapi dashboard
3. Your API key has access to that assistant

## Development

Watch mode for development:

```bash
npm run dev
```

This will automatically restart the script when you make changes.

