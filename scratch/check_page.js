const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    executablePath: 'C:\\Users\\krish\\.cache\\puppeteer\\chrome\\win64-152.0.7977.42\\chrome-win64\\chrome.exe'
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('https://roam-smart.vercel.app', { waitUntil: 'networkidle0' });
  
  console.log('Page loaded. Checking for errors...');
  const content = await page.content();
  console.log('HTML length:', content.length);
  
  await browser.close();
})();
