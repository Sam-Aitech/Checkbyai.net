import { Link } from "wouter";
import { Shield, FileText, CheckCircle, ArrowLeft, AlertCircle, Info, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function COSGuide() {
  return (
    <PageLayout>
      <SEOHead
        title="Certificate of Sponsorship Guide | UK Skilled Worker Visa | Check By AI"
        description="Complete guide to UK Certificate of Sponsorship documents. Learn what a CoS is, how to verify it, and what to check before applying for your Skilled Worker visa."
        keywords="certificate of sponsorship guide, UK CoS explained, skilled worker visa CoS, UK sponsor licence, CoS reference number"
        canonicalUrl="https://checkbyai.net/cos-guide"
        structuredData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "position": 1,
                  "name": "Home",
                  "item": "https://checkbyai.net"
                },
                {
                  "@type": "ListItem",
                  "position": 2,
                  "name": "CoS Guide",
                  "item": "https://checkbyai.net/cos-guide"
                }
              ]
            },
            {
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "How long is a CoS valid?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "A Certificate of Sponsorship is valid for 3 months from the date it's assigned. You must submit your visa application within this period."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Can I verify my CoS reference number?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "The Home Office verifies the CoS reference number during your visa application. However, you can check if your sponsor is a licensed sponsor on the official UK government website."
                  }
                },
                {
                  "@type": "Question",
                  "name": "What if my CoS has errors?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "If there are errors on your CoS, contact your employer immediately. They may need to withdraw the incorrect CoS and issue a new one with the correct information."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Why should I verify my CoS document?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Verifying your CoS helps ensure the document you received hasn't been tampered with. Submitting a fraudulent CoS can result in visa refusal and a ban from future UK applications."
                  }
                }
              ]
            }
          ]
        }}
      />
      <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-12">
          <div className="inline-flex items-center px-4 py-2 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-800 dark:text-blue-200 text-sm font-medium mb-4">
            <FileText className="w-4 h-4 mr-2" />
            UK Immigration Guide
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Certificate of Sponsorship Guide
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Everything you need to know about UK CoS documents for Skilled Worker visas
          </p>
        </div>

        <div className="grid gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Info className="w-6 h-6 text-blue-600" />
                What is a Certificate of Sponsorship?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                A Certificate of Sponsorship (CoS) is an electronic record, not a physical document, assigned by a UK employer to a worker they want to sponsor for a Skilled Worker visa.
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Important:</strong> The CoS contains a unique reference number that you'll need when applying for your visa. Your employer must be a licensed sponsor to issue a CoS.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                What Should a Genuine CoS Contain?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>CoS Reference Number</strong>
                    <p className="text-sm text-gray-600 dark:text-gray-400">A unique alphanumeric code assigned by the Home Office</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Sponsor Details</strong>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Company name, licence number, and contact information</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Job Details</strong>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Job title, SOC code, salary, and working hours</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Personal Information</strong>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Your name, date of birth, and nationality</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Start Date</strong>
                    <p className="text-sm text-gray-600 dark:text-gray-400">When your employment is expected to begin</p>
                  </div>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-red-600" />
                Warning Signs of a Fake CoS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Document was created using image editing software (Photoshop, GIMP, etc.)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Modification date is before the creation date</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Contains editing history showing multiple modifications</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Inconsistent fonts or formatting</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Sponsor licence number doesn't match official records</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <HelpCircle className="w-6 h-6 text-purple-600" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>How long is a CoS valid?</AccordionTrigger>
                  <AccordionContent>
                    A Certificate of Sponsorship is valid for 3 months from the date it's assigned. You must submit your visa application within this period.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Can I verify my CoS reference number?</AccordionTrigger>
                  <AccordionContent>
                    The Home Office verifies the CoS reference number during your visa application. However, you can check if your sponsor is a licensed sponsor on the official UK government website.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>What if my CoS has errors?</AccordionTrigger>
                  <AccordionContent>
                    If there are errors on your CoS, contact your employer immediately. They may need to withdraw the incorrect CoS and issue a new one with the correct information.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4">
                  <AccordionTrigger>Why should I verify my CoS document?</AccordionTrigger>
                  <AccordionContent>
                    Verifying your CoS helps ensure the document you received hasn't been tampered with. Submitting a fraudulent CoS can result in visa refusal and a ban from future UK applications.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>

          <div className="text-center">
            <Link href="/dashboard">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                <Shield className="w-5 h-5 mr-2" />
                Verify Your CoS Now
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
