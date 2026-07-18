import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = {
  apiKey: "AIzaSyC_MDIofQyyhFuf4wExb9YMNU9eXbq6doI",
  authDomain: "ff14-submarines.firebaseapp.com",
  projectId: "ff14-submarines",
  storageBucket: "ff14-submarines.firebasestorage.app",
  messagingSenderId: "793796797996",
  appId: "1:793796797996:web:ec0beff5ce87ee45755389"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const recipesPath = 'C:/Users/MaiMai/.gemini/antigravity/brain/1e09eaf1-bf0f-4e17-97b8-fd97d30a800d/scratch/recipes.json';
const recipes = JSON.parse(fs.readFileSync(recipesPath, 'utf8'));

async function seed() {
  console.log(`Seeding ${recipes.length} recipes to Firestore...`);
  const batch = writeBatch(db);

  recipes.forEach((recipe) => {
    const docRef = doc(db, 'part_ingredients', recipe.partId);
    const { partId, ...data } = recipe;
    batch.set(docRef, data);
  });

  await batch.commit();
  console.log(`Successfully seeded ${recipes.length} recipes to Firestore!`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error seeding to Firestore:', err);
  process.exit(1);
});
