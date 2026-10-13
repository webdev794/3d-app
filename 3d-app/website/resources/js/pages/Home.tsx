import { ArrowRight, Box, Layers, Monitor, MousePointer2, Palette, PenTool, Smartphone, Sparkles, Type } from 'lucide-react';
import { Link } from 'react-router-dom';
import { media } from '../api';
import StoreBadges from '../components/StoreBadges';
import '../../css/home.css';

export default function Home({onStart,onStudio}:{onStart:(mode:'ai'|'dyo')=>void;onStudio:()=>void}) {
  return <div className="home-next">
    <section className="campaign-hero" aria-labelledby="campaign-title">
      <img className="campaign-backdrop" src={media('campaign/hero-3deezi.webp')} alt="Realistic 3DEEZI jersey in a cinematic floodlit stadium" fetchPriority="high"/>
      <div className="campaign-shade"/>
      <div className="hero-phone" aria-hidden="true"><div className="hero-phone-frame"><span className="hero-phone-notch"/><img src={media('showroom/app-home.webp')} alt=""/></div><div className="hero-phone-glow"/></div>
      <div className="campaign-copy"><p className="eyebrow">FROM IDEA TO YOUR TEAM’S NEXT KIT</p><h1 id="campaign-title">YOUR NEXT<br/><span>GAME CHANGER.</span><br/>STARTS HERE.</h1><p>Create sportswear with AI, real-time 3D, and your own artwork. For teams, clubs, brands, and the people who make them stand out.</p><button className="button button-gradient" onClick={()=>document.getElementById('create-options')?.scrollIntoView({behavior:'smooth'})}>START CREATING <ArrowRight size={21}/></button><StoreBadges className="hero-stores"/></div>
      <button className="campaign-live" onClick={onStudio}><span className="live-dot"/><span>EXPLORE THE 3D STUDIO</span><Box size={15}/><ArrowRight size={15}/></button>
    </section>
    <section className="creation-paths" id="create-options" aria-label="Choose how to create">
      <button className="path-card path-ai" onClick={()=>onStart('ai')}><img src={media('images/art/home_ai.jpg')} alt="Electric cyan custom jersey concept" loading="lazy"/><div className="path-shade"/><div className="path-heading"><span className="path-icon"><Sparkles size={27}/></span><h2>AI POWERED<br/><span>SPORTSWEAR</span></h2></div><p>Describe it. Create it. Refine it.<br/>Turn your brief into your next kit.</p><span className="button button-outline">START WITH AI <ArrowRight size={17}/></span></button>
      <button className="path-card path-dyo" onClick={()=>onStart('dyo')}><img src={media('images/art/home_dyo.jpg')} alt="Black and cyan jersey ready to customize" loading="lazy"/><div className="path-shade"/><div className="path-heading"><span className="path-icon"><Box size={27}/></span><h2>DESIGN<br/><span>YOUR OWN</span></h2></div><p>Choose your sport. Customize every<br/>detail in 3D. Make it yours.</p><span className="button button-outline">START DESIGNING <ArrowRight size={17}/></span></button>
      <Link to="/artboard" className="path-card path-artboard"><div className="mini-artboard" aria-hidden="true"><div className="mini-bar"><span/><span/><span/></div><div className="mini-tools"><MousePointer2/><PenTool/><Type/><Layers/></div><div className="mini-canvas"><img src={media('images/emblem-final.png')} alt=""/><i/><i/><i/><i/></div><div className="mini-swatches"><span/><span/><span/><span/></div></div><div className="path-heading"><span className="path-icon"><PenTool size={27}/></span><h2>3DEEZI<br/><span>ARTBOARD</span></h2></div><p>Arrange logos, shapes, and artwork.<br/>Bring your composition into the 3D kit.</p><span className="button button-outline">OPEN ARTBOARD <ArrowRight size={17}/></span></Link>
    </section>
    <section className="home-app-strip"><div><Smartphone size={21}/><span>On your desktop. On your team’s next adventure.</span></div><Link to="/downloads">EXPLORE THE APPS <ArrowRight size={15}/></Link></section>
  </div>;
}

export function DownloadsPage(){
  return <div className="page-shell downloads-page"><section className="download-copy"><span className="eyebrow">YOUR STUDIO, WHEREVER YOU CREATE</span><h1>A big idea.<br/><span>In your pocket.</span></h1><p>Design your kit, organize your artwork, and keep your projects together across the 3DEEZI website and apps.</p><StoreBadges className="download-stores" soon /><p className="download-status">Official store downloads will appear here when the apps are published.</p><Link to="/studio" className="button button-gradient"><Monitor size={18}/> DESIGN IN YOUR BROWSER <ArrowRight size={18}/></Link><div className="download-features"><span><Palette size={15}/> Live kit customization</span><span><Layers size={15}/> Artwork & saved projects</span><span><Box size={15}/> Interactive 3D previews</span></div></section><div className="phone-display"><div className="phone-halo"/><div className="phone-mockup"><div className="phone-camera"/><div className="phone-screen"><img className="phone-brand" src={media('images/brand-final.png')} alt="3DEEZI"/><span className="phone-screen-label">YOUR NEXT KIT STARTS HERE</span><img className="phone-jersey" src={media('images/art/onboarding.jpg')} alt="3DEEZI mobile kit preview"/><div className="phone-tools"><Palette/><Layers/><Type/><Box/></div><span className="phone-save">YOUR SPORT. YOUR WAY.</span></div></div><span className="phone-caption">3DEEZI · WEBSITE & APPS</span></div></div>;
}
