
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load env simply
const envPath = path.resolve(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/GOOGLE_VISION_API_KEY="([^"]+)"/);
const apiKey = match ? match[1] : null;

console.log('Testing API Key:', apiKey ? apiKey.substring(0, 5) + '...' : 'NOT FOUND');

if (!apiKey) {
    console.error("No API Key found in .env");
    process.exit(1);
}

const requestBody = JSON.stringify({
    requests: [
        {
            image: {
                content: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" // 1x1 pixel gif base64
            },
            features: [
                { type: "TEXT_DETECTION" }
            ]
        }
    ]
});

const options = {
    hostname: 'vision.googleapis.com',
    port: 443,
    path: `/v1/images:annotate?key=${apiKey}`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': requestBody.length
    }
};

const req = https.request(options, (res) => {
    console.log(`StatusCode: ${res.statusCode}`);
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Response Body:', data);
    });
});

req.on('error', (error) => {
    console.error(error);
});

req.write(requestBody);
req.end();
