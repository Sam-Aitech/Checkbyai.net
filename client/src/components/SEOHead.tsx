import { useEffect } from 'react';

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  structuredData?: object;
  breadcrumbs?: BreadcrumbItem[];
  speakable?: boolean;
}

export default function SEOHead({
  title,
  description,
  keywords,
  ogTitle,
  ogDescription,
  ogImage,
  canonicalUrl,
  structuredData,
  breadcrumbs,
  speakable
}: SEOHeadProps) {
  useEffect(() => {
    document.title = title;

    const updateMetaTag = (name: string, content: string, property?: boolean) => {
      const attribute = property ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement;
      
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, name);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    const updateLinkTag = (rel: string, href: string) => {
      let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
      
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
    };

    updateMetaTag('title', title);
    updateMetaTag('description', description);
    if (keywords) updateMetaTag('keywords', keywords);

    updateMetaTag('og:title', ogTitle || title, true);
    updateMetaTag('og:description', ogDescription || description, true);
    updateMetaTag('og:type', 'website', true);
    
    if (ogImage) {
      updateMetaTag('og:image', ogImage, true);
    }

    if (canonicalUrl) {
      updateMetaTag('og:url', canonicalUrl, true);
      updateLinkTag('canonical', canonicalUrl);
    }

    updateMetaTag('twitter:title', ogTitle || title, true);
    updateMetaTag('twitter:description', ogDescription || description, true);
    updateMetaTag('twitter:card', 'summary_large_image', true);
    
    if (ogImage) {
      updateMetaTag('twitter:image', ogImage, true);
    }

    if (structuredData) {
      let scriptTag = document.querySelector('script[type="application/ld+json"][data-dynamic]') as HTMLScriptElement;
      
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.type = 'application/ld+json';
        scriptTag.setAttribute('data-dynamic', 'true');
        document.head.appendChild(scriptTag);
      }

      let sdObject = structuredData as Record<string, any>;
      if (speakable) {
        sdObject = {
          ...sdObject,
          speakable: {
            "@type": "SpeakableSpecification",
            cssSelector: ["h1", ".editorial-subheading", "meta[name='description']"]
          }
        };
      }
      
      scriptTag.textContent = JSON.stringify(sdObject);
    }

    if (breadcrumbs && breadcrumbs.length > 0) {
      let breadcrumbScript = document.querySelector('script[type="application/ld+json"][data-breadcrumb]') as HTMLScriptElement;
      
      if (!breadcrumbScript) {
        breadcrumbScript = document.createElement('script');
        breadcrumbScript.type = 'application/ld+json';
        breadcrumbScript.setAttribute('data-breadcrumb', 'true');
        document.head.appendChild(breadcrumbScript);
      }
      
      const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: item.url
        }))
      };
      
      breadcrumbScript.textContent = JSON.stringify(breadcrumbSchema);
    } else {
      const existingBreadcrumb = document.querySelector('script[type="application/ld+json"][data-breadcrumb]');
      if (existingBreadcrumb) {
        existingBreadcrumb.remove();
      }
    }

  }, [title, description, keywords, ogTitle, ogDescription, ogImage, canonicalUrl, structuredData, breadcrumbs, speakable]);

  return null;
}