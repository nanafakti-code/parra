const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
    if (!email || email.length > 320) return false;
    return EMAIL_REGEX.test(email);
}

export function sanitizeNewsletterText(value: string): string {
    return value
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim();
}
