/* Public site settings. Use a full HTTPS calendar URL to enable online booking.
   Leave blank to retain the working call/email consultation dialog. No secrets. */
window.NMP_CONFIG = Object.freeze({
  bookingUrl: "",
  /* The planning app's fact finder (full HTTPS URL, e.g. https://app.nationalmedicaidplanning.com/interview).
     When set, the hero button opens it; when blank, the hero button keeps the consultation dialog. */
  interviewUrl: ""
});
