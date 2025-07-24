require('dotenv').config();
const sql = require('mssql');
const XLSX = require('xlsx');


// Configuración para conexión a PRODUCCIÓN
const prodConfig = {
  user: process.env.DB_PROD_USER,
  password: process.env.DB_PROD_PASSWORD,
  server: process.env.DB_PROD_SERVER, // IP o hostname
  database: process.env.DB_PROD_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// Configuración para conexión a TEST
const testConfig = {
  user: process.env.DB_TST_USER,
  password: process.env.DB_TST_PASSWORD,
  server: process.env.DB_TST_SERVER,
  database: process.env.DB_TST_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function getConfigs(config, label) {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT name, value FROM Account_Config
    `);
    await pool.close();

    const map = {};
    for (const row of result.recordset) {
      map[row.name] = row.value;
    }
    console.log(`✔ ${label} cargada con ${result.recordset.length} registros.`);
    return map;
  } catch (err) {
    console.error(`❌ Error al conectarse a ${label}:`, err);
    process.exit(1);
  }
}

function compareConfigs(prodMap, testMap) {
  const allKeys = new Set([...Object.keys(prodMap), ...Object.keys(testMap)]);
  const diferencias = [];

  for (const key of allKeys) {
    const prodValue = prodMap[key];
    const testValue = testMap[key];

    if (prodValue === undefined) {
      diferencias.push({
        name: key,
        issue: 'Falta en PROD',
        prod_value: '',
        test_value: testValue,
      });
    } else if (testValue === undefined) {
      diferencias.push({
        name: key,
        issue: 'Falta en TEST',
        prod_value: prodValue,
        test_value: '',
      });
    } else if (prodValue !== testValue) {
      diferencias.push({
        name: key,
        issue: 'Valores con Diferencia',
        prod_value: prodValue,
        test_value: testValue,
      });
    }
  }

  return diferencias;
}

function exportToExcel(data, filename = 'diferencias.xlsx') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, 'Diferencias');
  XLSX.writeFile(wb, filename);
  console.log(`📄 Archivo Excel generado: ${filename}`);
}

async function runComparison() {
  const prodData = await getConfigs(prodConfig, 'PRODUCCIÓN');
  const testData = await getConfigs(testConfig, 'TEST');

  console.log('\n🔍 Comparando configuraciones...');
  const diferencias = compareConfigs(prodData, testData);

  if (diferencias.length === 0) {
    console.log('✅ Las configuraciones están alineadas.');
  } else {
    diferencias.forEach((d) => {
      console.log(
        `⚠ ${d.issue} → ${d.name}: PROD='${d.prod_value}' | TEST='${d.test_value}'`
      );
    });
    const fecha = new Date();
    const fechaStr = fecha
      .toISOString()
      .replace(/:/g, '-') // reemplaza ":" por "-"
      .replace(/\..+/, ''); // remueve los milisegundos y la "Z"

    exportToExcel(diferencias, `Diferencias-${fechaStr}.xlsx`);
  }
}

runComparison();

// ejecutar con:  node compareConfigs.js
