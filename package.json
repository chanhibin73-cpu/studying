import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCLUmB0EZQo74lcag_wkO3W2eeSmgLbkLM",
  authDomain: "project-1224701875846372493.firebaseapp.com",
  databaseURL: "https://project-1224701875846372493-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "project-1224701875846372493",
  storageBucket: "project-1224701875846372493.firebasestorage.app",
  messagingSenderId: "1035606846917",
  appId: "1:1035606846917:web:137407f1ee94522cf46fac",
  measurementId: "G-T26H0PEDJ1"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) getAnalytics(app);
  });
}

