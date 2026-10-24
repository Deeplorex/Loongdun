import { Blocks, FileText, Scale, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { getLegalDocument, type LegalDocumentId } from "../legal/legalDocuments";
import thirdPartyComponents from "../legal/third-party-components.json";
import { useI18n } from "../lib/i18n";

interface LegalDialogProps {
  initialDocument?: LegalDocumentId;
  onClose: () => void;
}

type Ecosystem = "npm" | "cargo" | "native";

const documentIcons = {
  privacy: FileText,
  terms: Scale,
  "open-source": Blocks,
} as const;

export function LegalDialog({ initialDocument = "privacy", onClose }: LegalDialogProps) {
  const { language, t } = useI18n();
  const titleId = useId();
  const [activeDocument, setActiveDocument] = useState<LegalDocumentId>(initialDocument);
  const [licenseText, setLicenseText] = useState<Record<
    string,
    { name: string; text: string }[]
  > | null>(null);
  const [selectedLicense, setSelectedLicense] = useState("");
  const [licenseError, setLicenseError] = useState(false);
  const showLicense = async (id: string) => {
    setSelectedLicense(id);
    setLicenseError(false);
    if (!licenseText) {
      try {
        setLicenseText((await import("../legal/third-party-license-texts.json")).default);
      } catch {
        setLicenseError(true);
      }
    }
  };
  const legalDocument =
    activeDocument === "open-source" ? null : getLegalDocument(activeDocument, language);
  const componentGroups = useMemo(
    () =>
      (["npm", "cargo", "native"] as const).map((ecosystem) => ({
        ecosystem,
        components: thirdPartyComponents.components.filter(
          (component) => component.ecosystem === ecosystem,
        ),
      })),
    [],
  );

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const labelForEcosystem = (ecosystem: Ecosystem) => {
    if (ecosystem === "npm") return t("界面与桌面桥接");
    if (ecosystem === "cargo") return t("本地核心");
    return t("原生组件");
  };

  return (
    <div className="modal-backdrop legal-modal-backdrop">
      <button
        type="button"
        className="modal-backdrop-dismiss"
        aria-label={t("关闭")}
        onClick={onClose}
      />
      <section className="legal-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-head">
          <div>
            <p className="eyebrow">{t("法律与许可")}</p>
            <h2 id={titleId}>{t("关于龙盾")}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("关闭")}>
            <X size={19} />
          </button>
        </header>

        <nav className="legal-tabs" aria-label={t("法律文档")}>
          {(["privacy", "terms", "open-source"] as const).map((documentId) => {
            const Icon = documentIcons[documentId];
            const label =
              documentId === "privacy"
                ? t("隐私政策")
                : documentId === "terms"
                  ? t("用户协议")
                  : t("第三方开源许可");
            return (
              <button
                key={documentId}
                type="button"
                className={activeDocument === documentId ? "active" : ""}
                aria-current={activeDocument === documentId ? "page" : undefined}
                onClick={() => setActiveDocument(documentId)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="legal-body">
          {legalDocument ? (
            <article className="legal-document">
              <header>
                <h3>{legalDocument.title}</h3>
                <p className="legal-document__version">{legalDocument.version}</p>
                <p>{legalDocument.introduction}</p>
              </header>
              {legalDocument.sections.map((section) => (
                <section key={section.title}>
                  <h4>{section.title}</h4>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.items && (
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </article>
          ) : (
            <article className="legal-document open-source-document">
              <header>
                <h3>{t("第三方开源许可")}</h3>
                <p>{t("龙盾使用以下开源软件。各组件仍由其权利人拥有，并按对应许可提供。")}</p>
              </header>
              {componentGroups.map(({ ecosystem, components }) => (
                <section className="open-source-group" key={ecosystem}>
                  <div className="open-source-group__head">
                    <h4>{labelForEcosystem(ecosystem)}</h4>
                    <span>{t("{count} 个组件", { count: components.length })}</span>
                  </div>
                  <div className="open-source-list">
                    {components.map((component) => (
                      <div className="open-source-row" key={component.id}>
                        <strong>{component.name}</strong>
                        <span>{component.version}</span>
                        <code>{component.license}</code>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => void showLicense(component.id)}
                          aria-label={`${t("查看许可原文")} ${component.name} ${component.version}`}
                        >
                          {t("查看许可原文")}
                        </button>
                        {selectedLicense === component.id && (
                          <div className="license-original">
                            {licenseError ? (
                              <p role="alert">{t("许可文本加载失败，请重试。")}</p>
                            ) : !licenseText ? (
                              <p>{t("正在加载…")}</p>
                            ) : (
                              licenseText[component.id]?.map((file, index) => (
                                <details key={`${file.name}-${index}`} open={index === 0}>
                                  <summary>{file.name}</summary>
                                  <pre>{file.text}</pre>
                                </details>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              <p className="legal-note">
                {t(
                  "完整清单随安装包提供。平台名称与图标的商标权归各自权利人所有，不代表其对龙盾的认可。",
                )}
              </p>
            </article>
          )}
        </div>

        <footer className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            {t("完成")}
          </button>
        </footer>
      </section>
    </div>
  );
}
