import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  projectId: 'notos-kitchen-stock-movement'
});

const db = getFirestore();

async function run() {
  try {
    console.log('--- REQUISITIONS ---');
    const snap = await db.collection('requisitions').get();
    snap.forEach(doc => {
      console.log(JSON.stringify({ id: doc.id, ...doc.data() }, null, 2));
    });
    console.log('--- END REQUISITIONS ---');
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();
