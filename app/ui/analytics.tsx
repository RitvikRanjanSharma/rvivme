"use client";

// app/ui/analytics.tsx
// ============================================================================
// The Google Analytics 4 tag.
//
// WHY THIS DID NOT EXIST UNTIL NOW
//
// NEXT_PUBLIC_GA4_MEASUREMENT_ID has been set in the environment for a long
// time, the dashboard has a GA4 panel, and the API route reads the property
// happily. But nothing ever put the tag on the page, so GA4 had nothing to
// record. Sessions, users and pageviews all read zero, and the honest empty
// state — "connected, waiting for your first sessions" — was true but
// misleading: no amount of waiting was going to change it.
//
// Worth noting how that hid: every layer downstream worked. The property was
// connected, the API returned 200, the panel rendered. The only broken link
// was the one nothing tested, because "did any data go in" is not a question
// any of those layers ask.
//
// CONSENT COMES FIRST
//
// We launch in the UK, where analytics cookies require consent BEFORE they are
// set. The privacy notice already promises exactly this: "Analytics &
// marketing — only set if you opted in via the cookie banner." So the tag is
// not merely deferred, it is withheld: no script is added to the page at all
// until analytics consent exists, and it is removed again if consent is
// withdrawn.
//
// The cookie banner was built with this in mind — it broadcasts
// `aiml-consent-change` and exports getCurrentConsent(). This listens to that
// contract rather than inventing a second source of truth about consent, which
// is the kind of duplication that ends with a banner saying one thing and a
// tag doing another.
// ============================================================================

import { useEffect } from "react";
import { getCurrentConsent } from "./cookie-banner";

const GA_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
const SCRIPT_ID = "aiml-ga4";

declare global {
  interface Window {
    dataLayer?: unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
  }
}

function loadGa(id: string) {
  if (document.getElementById(SCRIPT_ID)) return;

  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  // anonymize_ip is on because the privacy notice commits to processing
  // aggregate metrics rather than identifying individuals, and the default
  // would quietly contradict that.
  window.gtag("config", id, { anonymize_ip: true });
}

function unloadGa() {
  document.getElementById(SCRIPT_ID)?.remove();
  // Best effort: gtag cannot truly be "turned off" once initialised, so we
  // also clear the cookies it sets. Withdrawing consent has to actually stop
  // the collection, not just stop adding new script tags.
  try {
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0]?.trim();
      if (name && (name.startsWith("_ga") || name.startsWith("_gid"))) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
        document.cookie = `${name}=; Max-Age=0; path=/; domain=.${location.hostname}`;
      }
    }
  } catch { /* cookie access can throw in odd embedding contexts */ }
}

export function Analytics() {
  useEffect(() => {
    if (!GA_ID) return; // nothing configured — stay silent rather than guess

    function apply() {
      const consent = getCurrentConsent();
      if (consent?.analytics) loadGa(GA_ID!);
      else unloadGa();
    }

    apply();
    window.addEventListener("aiml-consent-change", apply);
    return () => window.removeEventListener("aiml-consent-change", apply);
  }, []);

  return null;
}
