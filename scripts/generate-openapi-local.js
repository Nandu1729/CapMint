const fs = require('fs');
const path = require('path');

const openapiPath = path.join(__dirname, '..', 'api', 'openapi', 'openapi.yaml');
const openapiLocalPath = path.join(__dirname, '..', 'api', 'openapi', 'openapi-local.yaml');

if (!fs.existsSync(openapiPath)) {
  console.error("Error: openapi.yaml not found!");
  process.exit(1);
}

let spec = fs.readFileSync(openapiPath, 'utf8');

// Replace title and description in the info block
spec = spec.replace(/title: CapMint Core API Specifications/, "title: CapMint Implemented API Specifications");
spec = spec.replace(
  /description: Canonical REST API contracts and validation schemas for the CapMint anti-counterfeiting platform\./,
  "description: API specifications mapping actual endpoints running in the Docker containers gateway."
);

// Modify the servers block: strip out the production gateway URL
const serversRegex = /servers:\s*\n(\s*-\s*url: http:\/\/localhost:8000\n\s*description: Local API Gateway \(Docker Nginx proxy\)\n)(\s*-\s*url: https:\/\/api\.capmint\.org\/api\/v1\n\s*description: Production Gateway\n)/;
spec = spec.replace(serversRegex, "servers:\n$1");

// Write the derived file
fs.writeFileSync(openapiLocalPath, spec, 'utf8');
console.log("Derived openapi-local.yaml successfully from openapi.yaml.");
