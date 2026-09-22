import { BookOpen, ClipboardCopy, ExternalLink, Globe2, LifeBuoy, Mail, MessageCircle, Phone, Wrench } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getSupportMailto, getSupportPhoneHref, getSupportWhatsAppHref, supportConfig } from "@/config/support-config";
import { getDiagnosticInfo, systemMetadata } from "@/config/system-metadata";

const faqItems = [
  {
    question: "¿Cómo creo un documento?",
    answer: "Entra a Generar, selecciona una plantilla, completa los campos requeridos, revisa la vista previa y genera el PDF.",
  },
  {
    question: "¿Cómo cargo una imagen o archivo?",
    answer: "Usa Archivos para guardar documentos en tu biblioteca, o carga el archivo directamente desde el campo solicitado en la plantilla.",
  },
  {
    question: "¿Dónde veo los documentos creados?",
    answer: "En Docs puedes consultar, descargar o eliminar los documentos generados.",
  },
  {
    question: "¿Qué hago si un archivo no carga?",
    answer: "Verifica que el archivo no esté dañado, que sea del formato permitido y que no supere el tamaño máximo configurado.",
  },
];

export default function SupportPage() {
  const [copyStatus, setCopyStatus] = useState("");
  const mailto = getSupportMailto();
  const phoneHref = getSupportPhoneHref();
  const whatsappHref = getSupportWhatsAppHref();
  const hasContact = Boolean(supportConfig.supportEmail || supportConfig.supportPhone || supportConfig.supportWhatsApp || supportConfig.supportWebsite);

  async function copyDiagnosticInfo() {
    try {
      await navigator.clipboard.writeText(getDiagnosticInfo());
      setCopyStatus("Información copiada.");
    } catch {
      setCopyStatus("No se pudo copiar automáticamente.");
    }
  }

  return (
    <section className="support-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Soporte</p>
          <h2>Centro de ayuda</h2>
          <p className="page-subtitle">Encuentra canales de atención, respuestas rápidas y datos para reportar un problema.</p>
        </div>
      </header>

      <article className="support-card support-hero">
        <div className="support-icon">
          <LifeBuoy className="size-5" aria-hidden={true} />
        </div>
        <div>
          <p className="eyebrow">Atención al cliente</p>
          <h3>{supportConfig.supportName}</h3>
          <p>{systemMetadata.productName} v{systemMetadata.version}</p>
        </div>
      </article>

      <div className="support-grid">
        <article className="support-card support-contact-card">
          <div className="support-card-heading">
            <Mail className="size-5" aria-hidden={true} />
            <h3>Contacto</h3>
          </div>
          {hasContact ? (
            <div className="support-list support-action-list">
              <div className="support-button-row">
                {whatsappHref ? (
                  <Button asChild>
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-2 size-4" aria-hidden={true} />
                      WhatsApp
                    </a>
                  </Button>
                ) : null}
                {supportConfig.supportEmail && mailto ? (
                  <Button asChild variant="ghost">
                    <a href={mailto}>
                      <Mail className="mr-2 size-4" aria-hidden={true} />
                      Correo
                    </a>
                  </Button>
                ) : null}
                {supportConfig.supportPhone && phoneHref ? (
                  <Button asChild variant="ghost">
                    <a href={phoneHref}>
                      <Phone className="mr-2 size-4" aria-hidden={true} />
                      Llamar
                    </a>
                  </Button>
                ) : null}
              </div>
              {supportConfig.supportEmail ? <a href={mailto} className="support-link">{supportConfig.supportEmail}</a> : null}
              {supportConfig.supportPhone && phoneHref ? <a href={phoneHref} className="support-link">{supportConfig.supportPhone}</a> : null}
              {supportConfig.supportWhatsApp ? <span className="support-muted">WhatsApp: {supportConfig.supportWhatsApp}</span> : null}
              {supportConfig.supportHours ? <p>{supportConfig.supportHours}</p> : null}
              {supportConfig.supportWebsite ? (
                <a href={supportConfig.supportWebsite} className="support-link" target="_blank" rel="noopener noreferrer">
                  Sitio web
                  <ExternalLink className="size-4" aria-hidden={true} />
                </a>
              ) : null}
            </div>
          ) : (
            <p className="support-muted">Canal de soporte pendiente de configurar.</p>
          )}
        </article>

        <article className="support-card">
          <div className="support-card-heading">
            <BookOpen className="size-5" aria-hidden={true} />
            <h3>Documentación</h3>
          </div>
          {supportConfig.documentationUrl ? (
            <a href={supportConfig.documentationUrl} className="support-link" target="_blank" rel="noopener noreferrer">
              Abrir documentación
              <ExternalLink className="size-4" aria-hidden={true} />
            </a>
          ) : (
            <p className="support-muted">La documentación estará disponible próximamente.</p>
          )}
        </article>

        <article className="support-card support-system-card">
          <div className="support-card-heading">
            <Wrench className="size-5" aria-hidden={true} />
            <h3>Datos para soporte</h3>
          </div>
          <dl className="system-info-list">
            <div><dt>Producto</dt><dd>{systemMetadata.productName}</dd></div>
            <div><dt>Versión</dt><dd>v{systemMetadata.version}</dd></div>
            <div><dt>Proveedor</dt><dd>{supportConfig.supportName}</dd></div>
            {systemMetadata.build ? <div><dt>Compilación</dt><dd>{systemMetadata.build}</dd></div> : null}
          </dl>
          <Button type="button" variant="ghost" className="support-copy-button" onClick={() => void copyDiagnosticInfo()}>
            <ClipboardCopy className="size-4" aria-hidden={true} />
            Copiar datos
          </Button>
          {copyStatus ? <p className="support-copy-status" role="status">{copyStatus}</p> : null}
        </article>
      </div>

      <section className="support-card">
        <div className="support-card-heading">
          <LifeBuoy className="size-5" aria-hidden={true} />
          <h3>Preguntas frecuentes</h3>
        </div>
        <div className="faq-list">
          {faqItems.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="support-card">
        <div className="support-card-heading">
          <Globe2 className="size-5" aria-hidden={true} />
          <h3>Reportar un problema</h3>
        </div>
        <p className="support-muted">
          Indica qué intentabas hacer, qué mensaje apareció y adjunta una captura si es necesario. Copiar los datos de soporte ayuda a resolverlo más rápido.
        </p>
        {mailto ? (
          <Button asChild>
            <a href={mailto}>Contactar soporte</a>
          </Button>
        ) : null}
      </section>
    </section>
  );
}
