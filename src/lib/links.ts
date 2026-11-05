// Public address of the app, used in links sent to spreadsheets and automations.
export const baseUrl = () => (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
