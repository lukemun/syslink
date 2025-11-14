"""
Browser-use script to navigate to DealMachine
"""
import asyncio
from browser_use import Browser
from playwright.async_api import async_playwright

async def navigate_to_dealmachine():
    """Navigate to DealMachine using browser-use"""
    
    print("🚀 Starting browser...")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        try:
            print("🌐 Navigating to DealMachine...")
            await page.goto('https://app.dealmachine.com/')
            await page.wait_for_load_state('networkidle')
            
            print("✅ Successfully loaded DealMachine!")
            print(f"📍 Current URL: {page.url}")
            print(f"📄 Page title: {await page.title()}")
            
            screenshot_path = 'dealmachine_screenshot.png'
            await page.screenshot(path=screenshot_path)
            print(f"📸 Screenshot saved to: {screenshot_path}")
            
            print("\n⏸️  Browser will stay open for 30 seconds...")
            await asyncio.sleep(30)
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
        
        finally:
            print("🔒 Closing browser...")
            await browser.close()

if __name__ == "__main__":
    print("=" * 60)
    print("🌐 DealMachine Browser Navigation Tool")
    print("=" * 60)
    print()
    asyncio.run(navigate_to_dealmachine())

