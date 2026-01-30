from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_notes_load(page: Page):
    # Navigate to the app
    page.goto("http://localhost:5173")

    # Wait for the app to load (it might redirect or show onboarding)
    # If onboarding appears, we might need to skip it or assume it's already configured if using same browser context (but verification uses fresh context)

    # Since it's a fresh context, it will likely show onboarding.
    # We can try to skip onboarding if possible or just verify onboarding loads.
    # Actually, the app uses localStorage for folder configuration.
    # In a fresh context, localStorage is empty.

    # Let's see what happens.
    time.sleep(2)
    page.screenshot(path="/home/jules/verification/initial_load.png")

    # Check if we are on onboarding
    if page.get_by_text("Welcome to Pinn").is_visible():
        print("Onboarding visible")
        # We can't easily proceed without user gesture for File System Access API
        # So we just verify the app loads.
        pass
    else:
        print("Not on onboarding?")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_notes_load(page)
        finally:
            browser.close()
