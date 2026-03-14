/**
 * src/pages/api/contact.ts
 *
 * Endpoint para procesar formularios de contacto.
 * POST /api/contact
 */

import type { APIRoute } from 'astro';
import { sendContactForm } from '../../lib/email/index';
import { contactLimiter } from '../../lib/security/rateLimiter';
import { getClientIp } from '../../lib/security/getClientIp';

export const POST: APIRoute = async (context) => {
  try {
    const ip = getClientIp(context.request);
    const { success } = await contactLimiter.limit(ip);
    if (!success) {
      return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Por favor, espera antes de enviar otro mensaje.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await context.request.json();
    const { nombre, email, asunto, mensaje } = body;

    // Validaciones
    if (!nombre?.trim()) {
      return new Response(JSON.stringify({ error: 'El nombre es requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!email?.trim() || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'El email es inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!asunto?.trim()) {
      return new Response(JSON.stringify({ error: 'El asunto es requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!mensaje?.trim()) {
      return new Response(JSON.stringify({ error: 'El mensaje es requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Enviar email
    await sendContactForm({
      name: nombre.trim(),
      email: email.trim(),
      subject: asunto.trim(),
      message: mensaje.trim(),
    });

    return new Response(JSON.stringify({ success: true, message: 'Mensaje enviado correctamente' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[contact] Error:', error);
    return new Response(JSON.stringify({
      error: 'Error al enviar el mensaje'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
