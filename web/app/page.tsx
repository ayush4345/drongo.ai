import Announce from "@/components/Announce";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Problem from "@/components/Problem";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import Flow from "@/components/Flow";
import AccentBand from "@/components/AccentBand";
import Tech from "@/components/Tech";
import Sponsors from "@/components/Sponsors";
import Cta from "@/components/Cta";
import SiteFooter from "@/components/SiteFooter";
import ScrollReveal from "@/components/ScrollReveal";

export default function Home() {
  return (
    <>
      <Announce />
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <Flow />
      <AccentBand />
      <Tech />
      <Sponsors />
      <Cta />
      <SiteFooter />
      <ScrollReveal />
    </>
  );
}
