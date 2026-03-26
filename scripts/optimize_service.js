const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

/**
 * Service Optimization Tool
 * 
 * Usage: bun scripts/optimize_service.js <path-to-service.json> --apiKey <optional-key> --params '{"q":"testing"}' [--fix]
 */

const NOISY_KEYS = ['success', 'status', 'api', 'version', 'query', 'search_query', 'type', 'page', 'number_of_results'];

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: bun scripts/optimize_service.js <path-to-service.json> [--apiKey <key>] [--params <json-string>] [--fix]');
        process.exit(1);
    }

    const servicePath = path.resolve(args[0]);
    let apiKey = '';
    let manualParams = {};
    let shouldFix = false;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--apiKey') apiKey = args[++i];
        else if (args[i] === '--params') manualParams = JSON.parse(args[++i]);
        else if (args[i] === '--fix') shouldFix = true;
    }

    if (!fs.existsSync(servicePath)) {
        console.error(`File not found: ${servicePath}`);
        process.exit(1);
    }

    const serviceData = JSON.parse(fs.readFileSync(servicePath, 'utf8'));
    const def = serviceData.definition;

    console.log(`\n🔍 Analyzing Service: ${def.name} (${def.id})`);

    // Prepare Request
    let apiUrl = def.apiUrl;
    const method = def.method || 'GET';
    const headers = def.headers || {};
    
    // Inject API Key
    for (const key in headers) {
        headers[key] = headers[key].replace(/<API_KEY>|YOUR_API_KEY|<ACCESS_TOKEN>/g, apiKey);
    }
    apiUrl = apiUrl.replace(/<API_KEY>|YOUR_API_KEY|<ACCESS_TOKEN>/g, encodeURIComponent(apiKey));

    // Determine Params from toolDefinition
    const toolDef = JSON.parse(def.toolDefinition);
    const params = { ...manualParams };
    
    // Default values if not provided
    if (toolDef.parameters && toolDef.parameters.properties) {
        for (const p in toolDef.parameters.properties) {
            if (!params[p]) {
                const prop = toolDef.parameters.properties[p];
                params[p] = prop.default || (prop.type === 'string' ? 'test' : 1);
            }
        }
    }

    console.log(`🛠  Sending ${method} request to: ${apiUrl}`);
    console.log(`📦 Parameters: ${JSON.stringify(params)}`);

    try {
        const response = await makeRequest(apiUrl, method, headers, params);
        analyzeResponse(response, serviceData, servicePath, shouldFix);
    } catch (error) {
        console.error(`❌ Request failed: ${error.message}`);
        if (error.response) console.error(JSON.stringify(error.response, null, 2));
    }
}

function makeRequest(apiUrl, method, headers, params) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new url.URL(apiUrl);
        
        if (method === 'GET') {
            for (const p in params) {
                parsedUrl.searchParams.append(p, params[p]);
            }
        }

        const options = {
            method: method,
            headers: {
                'User-Agent': 'Pinch-Optimization-Tool/1.0',
                ...headers
            }
        };

        if (method === 'POST' || method === 'PUT') {
            options.headers['Content-Type'] = 'application/json';
        }

        const req = https.request(parsedUrl, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject({ message: `HTTP ${res.statusCode}`, response: json });
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject({ message: `Response was not valid JSON: ${data.substring(0, 100)}...` });
                }
            });
        });

        req.on('error', (e) => reject(e));
        
        if (method === 'POST' || method === 'PUT') {
            req.write(JSON.stringify(params));
        }
        req.end();
    });
}

function analyzeResponse(data, serviceData, servicePath, shouldFix) {
    const currentKeys = serviceData.definition.responseKeys || [];
    const allKeys = new Set();
    
    function extractKeys(obj, prefix = '') {
        if (Array.isArray(obj)) {
            if (obj.length > 0 && typeof obj[0] === 'object') {
                extractKeys(obj[0], prefix);
            }
        } else if (obj !== null && typeof obj === 'object') {
            for (const key in obj) {
                allKeys.add(key);
                extractKeys(obj[key], key === 'results' || key === 'items' ? '' : `${key}.`);
            }
        }
    }

    extractKeys(data);

    const foundKeys = Array.from(allKeys);
    const noisyFound = foundKeys.filter(k => NOISY_KEYS.includes(k.toLowerCase()));
    const usefulFound = foundKeys.filter(k => !NOISY_KEYS.includes(k.toLowerCase())).sort();

    console.log('\n--- Analysis Results ---');
    console.log(`✅ Received ${foundKeys.length} unique keys in response.`);

    if (noisyFound.length > 0) {
        console.log(`⚠️  Found ${noisyFound.length} potentially noisy/redundant keys: [${noisyFound.join(', ')}]`);
    }

    if (currentKeys.length > 0) {
        const missing = currentKeys.filter(k => !foundKeys.includes(k));
        if (missing.length > 0) {
            console.log(`\n❓ Note: Your current responseKeys mention [${missing.join(', ')}] but they were not found in this response.`);
        }
    }

    if (shouldFix) {
        console.log(`\n🚀 Auto-fixing ${path.basename(servicePath)}...`);
        serviceData.definition.responseKeys = usefulFound;
        fs.writeFileSync(servicePath, JSON.stringify(serviceData, null, 4) + '\n');
        console.log('✅ Updated responseKeys and saved file.');
    } else {
        console.log('\n💡 Suggested responseKeys optimization:');
        console.log(JSON.stringify(usefulFound, null, 4));
        console.log('\n👉 Tip: Run with --fix to apply these changes automatically.');
    }
}

main();
