/// <reference types="astro/client" />

declare namespace App {
    interface Locals {
        user: {
            id: string;
            email?: string;
            [key: string]: any;
        } | null;
        role: string | null;
    }
}
