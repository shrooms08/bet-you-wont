"use client";

// 18+ gate, client side. The checkbox answer and the "under 18" choice are remembered in
// localStorage (best effort: blocked storage just means asking again).
const OK = "byw:age-ok";
const UNDER = "byw:under-18";

function get(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function set(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // storage blocked
  }
}

export const ageOk = () => get(OK);
export const setAgeOk = (on: boolean) => set(OK, on);
export const isUnder18 = () => get(UNDER);
export const markUnder18 = () => set(UNDER, true);

export const AGE_LINE = "i'm 18 or older and i agree to the terms and guidelines";
