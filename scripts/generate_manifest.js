const fs = require('fs');
const path = require('path');

const SERVICES_DIR = path.join(__dirname, '../services');
const SKILLS_DIR = path.join(__dirname, '../skills');
const MANIFEST_FILE = path.join(__dirname, '../manifest.json');

function getDirectories(source) {
    if (!fs.existsSync(source)) return [];
    return fs.readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
}

function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error reading or parsing ${filePath}:`, error);
        return null;
    }
}

function generateManifest() {
    const services = [];
    const skills = [];

    // Process Services
    const serviceDirs = getDirectories(SERVICES_DIR);
    serviceDirs.forEach(dir => {
        const servicePath = path.join(SERVICES_DIR, dir, 'service.json');
        const serviceData = readJsonFile(servicePath);

        if (serviceData) {
            // Basic Validation
            if (!serviceData.author || !serviceData.definition || !serviceData.definition.id) {
                console.warn(`Skipping invalid service in ${dir}: Missing required fields.`);
                return;
            }
            // Ensure folder name matches {author}-{id}? Not strictly enforcing here, but good practice.

            // Add metadata if needed, e.g., the directory name as the ID source of truth?
            // adhering to the schema provided
            services.push(serviceData);
        }
    });

    // Process Skills
    const skillDirs = getDirectories(SKILLS_DIR);
    skillDirs.forEach(dir => {
        const skillPath = path.join(SKILLS_DIR, dir, 'skill.json');
        const skillData = readJsonFile(skillPath);

        if (skillData) {
            // Basic Validation
            if (!skillData.author || !skillData.definition || !skillData.definition.id) {
                console.warn(`Skipping invalid skill in ${dir}: Missing required fields.`);
                return;
            }
            skills.push(skillData);
        }
    });

    const manifest = {
        version: 1,
        updatedAt: new Date().toISOString(),
        services: services,
        skills: skills
    };

    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    console.log(`Manifest generated with ${services.length} services and ${skills.length} skills.`);
}

generateManifest();
