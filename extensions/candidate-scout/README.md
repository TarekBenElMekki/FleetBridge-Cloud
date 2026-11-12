# FleetBridge Candidate Scout — Chrome extension v0.3.1

Companion to the FleetBridge European Transport Employer Atlas. This is a **separate Chrome Manifest V3 extension**, not a replacement for the existing LinkedIn **company-page collector**.

## Install / use

1. Open Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `FleetBridge-Candidate-Scout` directory.
2. Open a member's LinkedIn profile in Chrome and click the extension icon.
3. Press **Analyze** next to **Open Atlas** in the compact header. The extension reads the currently visible DOM **once** at your request. It does not scroll, click, paginate, or follow links automatically.
4. If work experience is truncated, expand **Show all experiences** (or follow LinkedIn's own experience details page), reopen the popup, press **Complete experience**. New history is merged with the prior capture for that same profile.
5. See colored work-location markers (most recent teal), named French administrative regions/departments, two compact candidate indicators, and an experience timeline.
6. If the latest captured job is in France, see Atlas public-transport employers within an editable **50 km default radius**. Export a candidate JSON for follow-up in FleetBridge Desktop CRM.

No login credentials, cookies, email data or browser history are collected. Profile data lives in **Chrome session storage**; closing the browser session clears it. Export is an explicit action. The page itself is not modified.

### Map label fix in v0.3.1

- Department names no longer disappear merely because their static geographical label point is outside the view. At department-level zoom (7+), each visible department is labeled inside the *currently visible portion* of its boundary; the labels are recalculated when the map moves or zooms.
- Labels use the full official department names. At country-wide zoom levels (5–6), region names remain the more legible overview.
- The extension keeps working fully offline using the same bundled French administrative geography; no external map-label service is needed.

### Simplified interface in v0.2.0

- Only the FleetBridge logo/name, **Open Atlas** and **Analyze** remain in the header.
- **Complete** is beside the *Experience geography* title, keeping the two-pass capture available.
- The experience map fits all resolved points at the nearest practical zoom (up to zoom 14), or zoom 13 for a single/shared city.
- Removed the interest selector, eligibility review, imported verified-jobs controls, and recruiter conclusion.
- The nearby section lists **only Atlas public-transport employers**.
- The compact *Transit Job Fit* card now shows **public-transport role relevance**, derived from visible experience, since there is no longer a live-vacancy matching interface. It is not an employer acceptance probability.

### Changes in v0.3.0

- The *Move Readiness* index now derives an **estimated career-mobility signal** from visible job contract types, latest tenure, role end dates, and recent job changes. It does not use the candidate's self-declared interest, age, gender, or other protected characteristics, and **it is not a calibrated probability** of changing employers. Sparse profiles show low confidence.
- Profile capture now searches the visible header text for city/region/country when LinkedIn's layout-specific location class is absent. It also reads the visible **Open to work** badge and its location/work-mode preferences, and shows these prominently on the candidate card. Headline job-search wording is labeled separately from a badge.
- The experience map adds **101 French departments and all 18 regions**, with full names revealed contextually by zoom. Department geometry comes from the Atlas' IGN/Etalab 2026 data; regional boundaries are derived offline from those departments. Job location markers still represent approximate city centres.
- Nearby employer matching has an editable distance filter, **50 km by default**, measured as straight-line distance from the candidate's latest captured French employment city centre. Empty results suggest increasing the range; no unverified vacancies are represented as actual job openings.

### Fix in v0.1.1

LinkedIn sometimes renders the Experience section with div-based cards instead of the older `li`/`section` structure. This release adds a second parser for visible experience text (job title, company, period and city) and a fallback to the profile page title for the candidate name. A partial profile no longer causes an immediate hard failure. After replacing extension files, open `chrome://extensions` and press **Reload** on Candidate Scout before testing again.

## What is/ isn't inferred

- **Career mobility** is an explainable *heuristic estimate of observable work-history patterns*, even when no interest has been expressed. A terminated last role is not proof of current unemployment, and the index cannot establish willingness to change jobs.
- **Open to work** is separately displayed if its badge appears on the visible page; it does not affect the career-mobility index.
- **Transit job fit** is an exploratory sector relevance score based on recognized transport work in the professional history, not a vacancy-specific or statistically validated score.
- **Licences and certifications** are still captured as unverified mentions in the exported data, but the eligibility review panel is removed.
- **Age is not estimated from career dates or graduation dates.** It is an unreliable and potentially discriminatory proxy. For a verified job with a legally relevant minimum age, a recruiter must check that requirement directly using appropriate information.
- **Nearest employers are not nearest job openings.** Atlas employer coordinates and extracted candidate locations are mostly **city-centre approximations**. Distances are not road commute times.
- A candidate's **right to work, shift preferences, salary and availability cannot be reliably derived** from LinkedIn.

## Geographic evidence

The offline map and city geocoder reuse the data bundled in the Atlas project:

- French cities from GeoNames via cities.json (CC BY 4.0).
- European country outlines from the Atlas' Natural Earth dataset (public domain).
- Metropolitan/overseas French departments from IGN / Etalab 2026 (Licence Ouverte 2.0), plus derived current region borders and labels.
- Atlas public-transport operators, including 179 French records from the 2026-11-04 snapshot. These records are not a complete current vacancy database.
- Leaflet (BSD-2-Clause) for the interactive mini-map; all assets are bundled locally.

Unrecognized workplaces are listed but not mapped. The extension **does not send candidate locations to a third-party geocoder**.

## Validation

From this directory, run: `node --test *.test.mjs`. No Node dependencies are required.

## Legal/product limitations

LinkedIn's current User Agreement and help pages prohibit browser extensions that scrape/copy profiles. The product uses a click-to-capture operation rather than autonomous scraping but still needs platform permission/compliance review before deployment. Alternatively import candidate-submitted CVs or use a permitted integration.

For European recruitment, assess lawful basis, transparency, retention, equality, data-subject rights and AI Act recruitment-related high-risk obligations before use. This is a recruiter **review aid**, not a system to automatically accept/reject applicants.

## Next integration step

Connect an authorized candidate-profile import and live official job feed; add recruiter-entered interest, verified licences, preferences and CRM outcome feedback. Once sufficiently many labeled outcomes exist, calibrate probabilities, validate fairness and keep humans in control of recruitment decisions.
