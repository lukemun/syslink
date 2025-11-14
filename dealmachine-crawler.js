import { PlaywrightCrawler } from 'crawlee';
import { readFile } from 'fs/promises';

// Load the delinquent taxes data
const delinquentTaxesData = JSON.parse(
    await readFile('./deliquency-crawler/delinquent_taxes_deduplicated.json', 'utf-8')
);

// Create a PlaywrightCrawler instance
const crawler = new PlaywrightCrawler({
    // Launch browser in headful mode to see what's happening
    headless: false,
    
    // Set viewport to MacBook Pro dimensions
    launchContext: {
        launchOptions: {
            viewport: {
                width: 1440,
                height: 900
            }
        }
    },
    
    // Request handler is called for each URL to crawl
    async requestHandler({ page, request, log }) {
        // Set viewport size for MacBook Pro (13"/14")
        await page.setViewportSize({ width: 1440, height: 900 });
        log.info(`Processing ${request.url}...`);
        
        try {
            // Wait for the page to load (use domcontentloaded instead of networkidle)
            // networkidle doesn't work well with sites that have continuous network activity
            // (like Google Maps, Intercom, analytics, etc.)
            await page.waitForLoadState('domcontentloaded');
            log.info('Page DOM loaded');
            
            // Wait for the email input to be visible - this is the best indicator the form is ready
            await page.waitForSelector('input[name="email"]', { timeout: 15000 });
            log.info('Login form is visible and ready');
            
            log.info('Login form found, filling in credentials...');
            
            // Fill in the email field
            await page.fill('input[name="email"]', 'Tomer@oblique-ai.com');
            log.info('Email field filled');
            
            // Wait a moment for any dynamic behavior
            await page.waitForTimeout(500);
            
            // Fill in the password field
            await page.fill('input[name="password"]', 'Epimandos17!');
            log.info('Password field filled');
            
            // Wait a moment to see the filled form
            await page.waitForTimeout(1000);
            
            // Click the "Continue With Email" button
            await page.click('div.deal-copy:has-text("Continue With Email")');
            log.info('Clicked "Continue With Email" button');
            
            // Wait for 5 seconds after clicking
            await page.waitForTimeout(5000);
            log.info('Waited 5 seconds after clicking login');
            
            log.info('✅ Successfully logged in to DealMachine');
            
            // Get the first address from the JSON
            const firstRecord = delinquentTaxesData[0];
            const address = firstRecord['Location Address'];
            log.info(`Using address: ${address}`);
            
            // Wait for the search input field to appear
            await page.waitForSelector('input[name="search"]', { timeout: 10000 });
            log.info('Found search input field');
            
            // Click the input to focus it
            await page.click('input[name="search"]');
            log.info('Clicked search input');
            
            // Type the address
            await page.locator('input[name="search"]').pressSequentially(address, { delay: 100 });
            log.info('✅ Address entered successfully');
            
            // Wait for the dropdown with results to appear
            await page.waitForSelector('div.deal-scroll', { timeout: 5000 });
            log.info('Dropdown with results appeared');
            
            // Wait a moment for results to fully load
            await page.waitForTimeout(2000);
            
            // Try multiple strategies to find and click the first property
            let clicked = false;
            
            // Strategy 1: Find rows after "Properties:" header and click the first one
            try {
                // Find all children of deal-scroll
                const scrollChildren = await page.$$('div.deal-scroll > *');
                log.info(`Strategy 1: Found ${scrollChildren.length} children in deal-scroll`);
                
                // Find the "Properties:" wrapper index
                let propertiesIndex = -1;
                for (let i = 0; i < scrollChildren.length; i++) {
                    const text = await scrollChildren[i].textContent();
                    if (text.includes('Properties:')) {
                        propertiesIndex = i;
                        log.info(`  Found "Properties:" header at index ${i}`);
                        break;
                    }
                }
                
                if (propertiesIndex >= 0 && propertiesIndex + 1 < scrollChildren.length) {
                    // The next element after "Properties:" should be the first property
                    const firstPropertyRow = scrollChildren[propertiesIndex + 1];
                    
                    // Get the address text for logging
                    const addressDiv = await firstPropertyRow.$('div.deal-copy');
                    if (addressDiv) {
                        const addressText = await addressDiv.evaluate(el => el.childNodes[0]?.textContent?.trim() || el.textContent.split('Jump to Location')[0].trim());
                        log.info(`  First property after "Properties:": "${addressText}"`);
                        
                        // Click the row with force
                        await firstPropertyRow.click({ force: true });
                        log.info('✅ Clicked first property (Strategy 1: first row after Properties header)');
                        clicked = true;
                    }
                }
            } catch (e) {
                log.error(`Strategy 1 failed: ${e.message}`);
            }
            
            // Strategy 2: Use JavaScript to dispatch click event on button
            if (!clicked) {
                try {
                    const buttons = await page.$$('div.deal-scroll div[role="button"]');
                    log.info(`Strategy 2: Found ${buttons.length} buttons, trying JS click`);
                    
                    if (buttons.length > 1) {
                        // Dispatch native click event using JavaScript
                        await buttons[1].evaluate(el => el.click());
                        log.info('✅ Clicked first property (Strategy 2: JS dispatch click)');
                        clicked = true;
                    }
                } catch (e) {
                    log.error(`Strategy 2 failed: ${e.message}`);
                }
            }
            
            // Strategy 3: Click on the button's clickable area using locator
            if (!clicked) {
                try {
                    const firstProperty = await page.locator('div.deal-scroll div.deal-row').filter({ 
                        hasText: 'Jump to Location' 
                    }).first();
                    
                    await firstProperty.locator('div.deal-button').click({ force: true });
                    log.info('✅ Clicked first property (Strategy 3: locator with force)');
                    clicked = true;
                } catch (e) {
                    log.error(`Strategy 3 failed: ${e.message}`);
                }
            }
            
            if (!clicked) {
                log.error('❌ Failed to click first property with all strategies');
            } else {
                // Wait for the property detail panel to appear
                try {
                    await page.waitForSelector('div.deal-right-panel-modal', { timeout: 10000 });
                    log.info('✅ Property detail panel appeared successfully');
                } catch (e) {
                    log.error('❌ Property detail panel did not appear after clicking');
                }
            }
            
            // Wait to see the result
            await page.waitForTimeout(5000);
            
        } catch (error) {
            log.error('Error processing page:', error);
        }
    },
    
    // This function is called if the page processing failed
    failedRequestHandler({ request, log }) {
        log.error(`Request ${request.url} failed too many times.`);
    },
});

// Run the crawler with the DealMachine login URL
await crawler.run(['https://app.dealmachine.com/']);

console.log('✅ Crawler finished successfully!');

