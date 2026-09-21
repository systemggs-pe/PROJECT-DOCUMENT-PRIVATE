import { BookOpen, ClipboardCopy, ExternalLink, Globe2, LifeBuoy, Mail, MessageCircle, Phone, Wrench } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getSupportMailto, getSupportPhoneHref, getSupportWhatsAppHref, supportConfig } from "@/config/support-config";
import { getDiagnosticInfo, systemMetadata } from "@/config/system-metadata";

const faqItems = [
  {
    question: "Como creo un documento?",
    answer: "Entra a Crear documento, selecciona una plantilla, completa los campos requeridos, revisa la vista previa y genera el PDF cuando todo este correcto.",
  },
  {
    question: "Como cargo una imagen o archivo?",
    answer: "Usa la biblioteca de Archivos o los campos de la plantilla. El sistema valida el tipo y peso antes de crear el documento.",
  },
  {
    question: "Como reviso el PDF antes de descargarlo?",
    answer: "La vista Crear documento permite actualizar una vista previa real del PDF antes de generar el documento final.",
  },
  {
    question: "Que hago si un archivo no carga?",
    answer: "Verifica que el archivo no este danado, que su extension coincida con el formato y que no supere los limites permitidos.",
  },
];

export default function SupportPage() {
  const [copyStatus, setCopyStatus] = useState("");
  const mailto = getSupportMailto();
  const phoneHref = getSupportPhoneHref();
  const whatsappHref = getSupportWhatsAppHref();
  const hasContact = Boolean(supportConfig.supportEmail || supportConfig.supportPhone || supportConfig.supportWhatsApp || supportConfig.supportWebsite);

  async function copyDiagnosticInfo() {
    const diagnosticInfo = getDiagnosticInfo();
    try {
      await navigator.clipboard.writeText(diagnosticInfo);
      setCopyStatus("Informacion del sistema copiada.");
    } catch {
      setCopyStatus("No se pudo copiar automaticamente.");
    }
  }

  return (
    <section className="support-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Soporte</p>
          <h2>Centro de ayuda</h2>
          <p className="page-subtitle">
            Canales de atencion del proveedor del software e informacion segura para reportar problemas.
          </p>
        </div>
      </header>

      <div className="support-grid">
        <article className="support-card support-hero">
          <div className="support-icon">
            <LifeBuoy className="size-5" aria-hidden={true} />
          </div>
          <div>
            <p className="eyebrow">Atencion al cliente</p>
            <h3>{supportConfig.supportName}</h3>
            <p>{systemMetadata.productName} - {systemMetadata.productFamily}</p>
          </div>
        </article>

        <article className="support-card">
          <div className="support-card-heading">
            <Mail className="size-5" aria-hidden={true} />
            <h3>Contacto</h3>
          </div>
          {hasContact ? (
            <div className="support-list support-action-list">
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
              {supportConfig.supportWebsite ? (
                <Button asChild variant="ghost">
                  <a href={supportConfig.supportWebsite} target="_blank" rel="noopener noreferrer">
                    <Globe2 className="mr-2 size-4" aria-hidden={true} />
                    Sitio web
                  </a>
                </Button>
              ) : null}
              {supportConfig.supportEmail ? <a href={mailto} className="support-link">{supportConfig.supportEmail}</a> : null}
              {supportConfig.supportPhone && phoneHref ? <a href={phoneHref} className="support-link">{supportConfig.supportPhone}</a> : null}
              {supportConfig.supportWhatsApp ? <span className="support-muted">WhatsApp: {supportConfig.supportWhatsApp}</span> : null}
              {supportConfig.supportHours ? <p>{supportConfig.supportHours}</p> : null}
            </div>
          ) : (
            <p className="support-muted">Canal de soporte por configurar.</p>
          )}
        </article>

        <article className="support-card">
          <div className="support-card-heading">
            <BookOpen className="size-5" aria-hidden={true} />
            <h3>Documentacion</h3>
          </div>
          {supportConfig.documentationUrl ? (
            <a href={supportConfig.documentationUrl} className="support-link" target="_blank" rel="noopener noreferrer">
              Abrir documentacion
              <ExternalLink className="size-4" aria-hidden={true} />
            </a>
          ) : (
            <p className="support-muted">Documentacion proximamente.</p>
          )}
        </article>

        <article className="support-card">
          <div className="support-card-heading">
            <Wrench className="size-5" aria-hidden={true} />
            <h3>Informacion del sistema</h3>
          </div>
          <dl className="system-info-list">
            <div><dt>Producto</dt><dd>{systemMetadata.productName}</dd></div>
            <div><dt>Version</dt><dd>v{systemMetadata.version}</dd></div>
            <div><dt>Proveedor</dt><dd>{systemMetadata.productFamily} / {supportConfig.supportName}</dd></div>
            {systemMetadata.build ? <div><dt>Compilacion</dt><dd>{systemMetadata.build}</dd></div> : null}
          </dl>
          <Button type="button" variant="ghost" className="support-copy-button" onClick={() => void copyDiagnosticInfo()}>
            <ClipboardCopy className="size-4" aria-hidden={true} />
            Copiar informacion del sistema
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
          <ClipboardCopy className="size-5" aria-hidden={true} />
          <h3>Reportar un problema</h3>
        </div>
        <p className="support-muted">
          Incluye que intentabas hacer, el mensaje de error, una captura si aplica y la informacion del sistema copiada desde esta pagina.
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
