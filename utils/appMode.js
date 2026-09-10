"use strict";

const APP_MODES = {
  teen: "teen",
  clinician: "clinician",
};

const APP_MODE_KEY = "@app_mode";

function normalizeAppMode(value) {
  return value === APP_MODES.clinician ? APP_MODES.clinician : APP_MODES.teen;
}

function isClinicianMode(mode) {
  return normalizeAppMode(mode) === APP_MODES.clinician;
}

function modeToggleLabel(mode) {
  return isClinicianMode(mode) ? "Show teen view" : "Show clinician view";
}

module.exports = {
  APP_MODES,
  APP_MODE_KEY,
  normalizeAppMode,
  isClinicianMode,
  modeToggleLabel,
};
