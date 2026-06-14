import admin from 'firebase-admin';

// Initialize firebase admin with project ID
admin.initializeApp({
  projectId: 'notos-kitchen-stock-movement'
});

const db = admin.firestore();

async function checkInventory() {
  try {
    console.log('Checking inventory items in all stores...');
    const inventorySnap = await db.collection('inventory').get();
    if (inventorySnap.empty) {
      console.log('No inventory items found in Firestore collection "inventory".');
    } else {
      console.log(`Found ${inventorySnap.size} inventory items:`);
      inventorySnap.forEach(doc => {
        const data = doc.data();
        console.log(`- Item ID: ${doc.id}, Store ID: ${data.storeId}, Item Name: ${data.itemName}, Qty: ${data.quantity}`);
      });
    }

    console.log('\nChecking catalog items...');
    const catalogSnap = await db.collection('items').get();
    if (catalogSnap.empty) {
      console.log('No catalog items found in Firestore collection "items".');
    } else {
      console.log(`Found ${catalogSnap.size} catalog items:`);
      catalogSnap.forEach(doc => {
        const data = doc.data();
        console.log(`- Catalog Item ID: ${doc.id}, Name: ${data.name}, SKU: ${data.sku}`);
      });
    }

    console.log('\nChecking stores...');
    const storesSnap = await db.collection('stores').get();
    storesSnap.forEach(doc => {
      console.log(`- Store: ${doc.id} (${doc.data().name})`);
    });
  } catch (error) {
    console.error('Error running checkInventory:', error);
  }
  process.exit(0);
}

checkInventory();
