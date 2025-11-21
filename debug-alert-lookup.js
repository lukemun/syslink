const fs = require('fs');
const path = require('path');

const alertsPath = path.join(process.cwd(), 'weather-alerts/active-alerts.json');
const rawData = fs.readFileSync(alertsPath, 'utf8');
const data = JSON.parse(rawData);

// Find the alert matching the user's description
const targetAlert = data.features.find(f => {
  const props = f.properties;
  const areaDesc = props.areaDesc || '';
  return (
    props.event === 'Flash Flood Warning' &&
    areaDesc.includes('Coconino') &&
    areaDesc.includes('Gila') &&
    areaDesc.includes('Yavapai')
  );
});

if (targetAlert) {
  console.log('Found Alert ID:', targetAlert.id || targetAlert.properties.id);
  console.log('Event:', targetAlert.properties.event);
  console.log('Area:', targetAlert.properties.areaDesc);
  console.log('Geometry Type:', targetAlert.geometry ? targetAlert.geometry.type : 'None');
  console.log('SAME codes:', targetAlert.properties.geocode ? targetAlert.properties.geocode.SAME : 'None');
  console.log('UGC codes:', targetAlert.properties.geocode ? targetAlert.properties.geocode.UGC : 'None');
} else {
  console.log('Alert not found matching criteria');
}




