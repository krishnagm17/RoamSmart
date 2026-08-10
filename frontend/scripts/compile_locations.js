const fs = require('fs');
const https = require('https');
const path = require('path');

const urls = {
  states: 'https://gist.githubusercontent.com/ihacker42/e776947a44a2bcce8a95087a03d3135b/raw/states.json',
  districts: 'https://gist.githubusercontent.com/ihacker42/800a9710428a353adb31ad42cc99be0d/raw/districts.json',
  tehsils: 'https://gist.githubusercontent.com/ihacker42/1d5c2d7c39895e687ca0ab9744dfed67/raw/3f4276109d8eab200afe4bceb7f515663bff1c32/tehsils.json'
};

const originalCities = [
  "Agartala, Tripura",
  "Agra, Uttar Pradesh",
  "Ahmedabad, Gujarat",
  "Aizawl, Mizoram",
  "Ajmer, Rajasthan",
  "Alappuzha, Kerala",
  "Amritsar, Punjab",
  "Aurangabad, Maharashtra",
  "Bengaluru, Karnataka",
  "Bhopal, Madhya Pradesh",
  "Bhubaneswar, Odisha",
  "Bikaner, Rajasthan",
  "Chandigarh, Chandigarh",
  "Chennai, Tamil Nadu",
  "Coimbatore, Tamil Nadu",
  "Darjeeling, West Bengal",
  "Dehradun, Uttarakhand",
  "Delhi, Delhi",
  "Dharamshala, Himachal Pradesh",
  "Gangtok, Sikkim",
  "Gaya, Bihar",
  "Goa, Goa",
  "Gokarna, Karnataka",
  "Guwahati, Assam",
  "Gwalior, Madhya Pradesh",
  "Hampi, Karnataka",
  "Haridwar, Uttarakhand",
  "Hyderabad, Telangana",
  "Imphal, Manipur",
  "Indore, Madhya Pradesh",
  "Itanagar, Arunachal Pradesh",
  "Jabalpur, Madhya Pradesh",
  "Jaipur, Rajasthan",
  "Jaisalmer, Rajasthan",
  "Jodhpur, Rajasthan",
  "Kanyakumari, Tamil Nadu",
  "Kochi, Kerala",
  "Kodaikanal, Tamil Nadu",
  "Kolkata, West Bengal",
  "Kozhikode, Kerala",
  "Leh, Ladakh",
  "Lucknow, Uttar Pradesh",
  "Madurai, Tamil Nadu",
  "Mahabalipuram, Tamil Nadu",
  "Manali, Himachal Pradesh",
  "Mangalore, Karnataka",
  "Matheran, Maharashtra",
  "Mumbai, Maharashtra",
  "Munnar, Kerala",
  "Mussoorie, Uttarakhand",
  "Mysore, Karnataka",
  "Nagpur, Maharashtra",
  "Nainital, Uttarakhand",
  "Nashik, Maharashtra",
  "Ooty, Tamil Nadu",
  "Panaji, Goa",
  "Patna, Bihar",
  "Pondicherry, Puducherry",
  "Port Blair, Andaman and Nicobar Islands",
  "Pune, Maharashtra",
  "Puri, Odisha",
  "Pushkar, Rajasthan",
  "Ranchi, Jharkhand",
  "Rishikesh, Uttarakhand",
  "Shillong, Meghalaya",
  "Shimla, Himachal Pradesh",
  "Srinagar, Jammu and Kashmir",
  "Surat, Gujarat",
  "Thanjavur, Tamil Nadu",
  "Thiruvananthapuram, Kerala",
  "Tirupati, Andhra Pradesh",
  "Udaipur, Rajasthan",
  "Vadodara, Gujarat",
  "Varanasi, Uttar Pradesh",
  "Varkala, Kerala",
  "Vijayawada, Andhra Pradesh",
  "Visakhapatnam, Andhra Pradesh"
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function cleanName(name) {
  if (!name) return '';
  return name
    .replace(/\s+/g, ' ')
    .replace(/-\s+e\s+-/gi, '-E-') // e.g. "Charar- E- Shrief" -> "Charar-E-Shrief"
    .trim();
}

function capitalizeWords(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function main() {
  try {
    console.log('Fetching states...');
    const statesData = await fetchJson(urls.states);
    console.log('Fetching districts...');
    const districtsData = await fetchJson(urls.districts);
    console.log('Fetching tehsils/talukas...');
    const tehsilsData = await fetchJson(urls.tehsils);

    console.log(`Loaded ${statesData.length} states, ${districtsData.length} districts, ${tehsilsData.length} tehsils.`);

    // Build map of state ID -> Name
    const stateMap = {};
    statesData.forEach(s => {
      let name = cleanName(s.name);
      // Map names to match standard spelling
      if (name.toLowerCase() === 'delhi') name = 'Delhi';
      stateMap[s.id] = capitalizeWords(name);
    });

    // Build map of district ID -> Name & State Name
    const districtMap = {};
    districtsData.forEach(d => {
      const stateName = stateMap[d.state_id] || '';
      districtMap[d.id] = {
        name: capitalizeWords(cleanName(d.name)),
        stateName: stateName
      };
    });

    const suggestions = new Set();

    // 1. Add original cities
    originalCities.forEach(city => suggestions.add(city));

    // 2. Add districts
    districtsData.forEach(d => {
      const distName = capitalizeWords(cleanName(d.name));
      const stateName = stateMap[d.state_id];
      if (distName && stateName) {
        suggestions.add(`${distName}, ${stateName}`);
      }
    });

    // 3. Add tehsils/talukas
    tehsilsData.forEach(t => {
      const tehsilName = capitalizeWords(cleanName(t.name));
      const distObj = districtMap[t.dist_id];
      if (tehsilName && distObj) {
        // If tehsil name is identical to district name, just keep district name suggestion
        if (tehsilName.toLowerCase() === distObj.name.toLowerCase()) {
          suggestions.add(`${distObj.name}, ${distObj.stateName}`);
        } else {
          suggestions.add(`${tehsilName}, ${distObj.name}, ${distObj.stateName}`);
        }
      }
    });

    const resultList = Array.from(suggestions).sort();
    console.log(`Generated ${resultList.length} unique location suggestions.`);

    const frontendPublicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(frontendPublicDir)) {
      fs.mkdirSync(frontendPublicDir, { recursive: true });
    }

    const outputPath = path.join(frontendPublicDir, 'locations.json');
    fs.writeFileSync(outputPath, JSON.stringify(resultList, null, 2), 'utf-8');
    console.log(`Saved output to ${outputPath}`);
  } catch (err) {
    console.error('Error during compilation:', err);
  }
}

main();
