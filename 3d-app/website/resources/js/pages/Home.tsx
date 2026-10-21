import { ArrowRight, BatteryFull, Box, ChevronLeft, ChevronRight, Layers, Monitor, MousePointer2, Palette, PenTool, Shirt, Signal, Sparkles, Type, Users, Wifi } from 'lucide-react';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { media } from '../api';
import StoreBadges, { AppleLogo, GooglePlayLogo } from '../components/StoreBadges';
import RewardsBanner from '../components/RewardsBanner';
import OrderNow from '../components/OrderNow';
import '../../css/home.css';

export default function Home({onStart}:{onStart:(mode:'ai'|'dyo')=>void}) {
  // 3DEEZI ASSIST scales with the page here, as in the design: 341 px wide at 1600 px, the cards beside it.
  useEffect(() => {
    const root = document.documentElement;
    const fit = () => root.style.setProperty('--assist-scale', String(Math.min(1.2, Math.max(.8, root.clientWidth / 1600 * 341 / 344))));
    fit(); window.addEventListener('resize', fit);
    return () => { window.removeEventListener('resize', fit); root.style.removeProperty('--assist-scale'); };
  }, []);
  // Layout from the client's homepage design (2026-10-15): the app with its store badges on the left,
  // the headline and Start creating in the middle, the kit on the right, the three ways to create below.
  return <div className="home-next">
    <div className="home-stage" style={{'--hero-photo': `url("${media('campaign/hero-3deezi.webp')}")`} as CSSProperties}><div className="home-stage-inner">
      <img className="campaign-backdrop" src={media('campaign/hero-3deezi.webp')} alt="Realistic 3DEEZI jersey in a cinematic floodlit stadium" fetchPriority="high"/>
      <div className="campaign-shade"/>
      <div className="hero-edge" aria-hidden="true"/><div className="hero-edge-floor" aria-hidden="true"/>
      <div className="hero-wordmark" aria-hidden="true"/>
      <div className="hero-smoke" aria-hidden="true"/>
      <div className="hero-lights" aria-hidden="true"><i className="hl-wetfloor"/><i className="hl-haze"/><i className="hl-box"/><i className="hl-tube"/><i className="hl-tube hl-tube-low"/><i className="hl-streak hl-streak-high"/><i className="hl-streak"/><i className="hl-floor"/></div>
      <section className="campaign-hero" aria-labelledby="campaign-title">
        <img className="hero-mark" src={media('images/hero-three-mobile.webp')} alt="" aria-hidden="true" loading="lazy"/>
        <div className="hero-app">
          <div className="hero-phone" aria-hidden="true"><div className="hero-phone-frame"><span className="hero-phone-side"/><span className="hero-phone-notch"/><div className="hero-phone-screen">
            <div className="hp-status"><span>9:41</span><span><Signal/><Wifi/><BatteryFull/></span></div>
            <img className="hp-brand" src={media('images/brand-tagline-final.png')} alt=""/>
            <div className="hp-tabs"><span className="on">JERSEY</span><span>SHORTS</span><span>SOCKS</span><span>FULL KIT</span></div>
            <div className="hp-kit"><ChevronLeft/><img src={media('showroom/garment-jersey.webp')} alt=""/><b>10</b><ChevronRight/></div>
            <div className="hp-colours"><span/><span/><span/><span/><span/><span/></div>
            <div className="hp-thumbs">{['jersey', 'polo', 'tee', 'jersey purple'].map((kit, i) => <span key={kit} className={i === 0 ? 'on' : ''}><img className={kit.split(' ')[1]} src={media(`showroom/garment-${kit.split(' ')[0]}.webp`)} alt=""/></span>)}</div>
            <span className="hp-home"/>
          </div></div><div className="hero-phone-glow"/></div>
          <StoreBadges className="hero-stores"/>
          <div className="hero-soon">
            <Link to="/downloads" aria-label="Coming soon on the App Store"><AppleLogo/><span><small>COMING SOON ON THE</small><strong>App Store</strong></span></Link>
            <Link to="/downloads" aria-label="Coming soon on Google Play"><GooglePlayLogo/><span><small>COMING SOON ON</small><strong>Google Play</strong></span></Link>
          </div>
        </div>
        <div className="hero-shot" aria-hidden="true"><img src={media('campaign/hero-3deezi.webp')} alt=""/></div>
        <div className="campaign-copy"><p className="eyebrow">FROM IDEA TO YOUR TEAM’S NEXT KIT</p><h1 id="campaign-title">YOUR NEXT<br/><span>GAME CHANGER.</span><br/>STARTS HERE.</h1><p>Create sportswear with AI, real-time 3D, and your own artwork. For teams, clubs, brands, and the people who make them stand out.</p><button className="button button-gradient" onClick={()=>document.getElementById('create-options')?.scrollIntoView({behavior:'smooth'})}>START CREATING <ArrowRight size={21}/></button></div>
      </section>
      {/* The four ways to create (client design 2026-10-21, 145.jpg): four equal tiles in one row on computers, 2 x 2 on
          tablets, stacked on phones. Each: icon, title, teal subtitle, description, a picture, a gradient button. */}
      <section className="creation-paths" id="create-options" aria-label="Choose how to create">
        <button className="path-card path-ai" onClick={()=>onStart('ai')}>
          <PathHeading icon={<Sparkles/>} title="AI DESIGNER" sub="LET AI CREATE IT"/>
          <p>Describe your ideas and let 3DEEZI AI generate custom designs instantly.</p>
          <div className="path-visual pv-ai" aria-hidden="true"><img src={media('images/art/home_ai.jpg')} alt="" loading="lazy"/><span className="pv-prompt"><span>A black and teal rugby league jersey with a tribal pattern and our logo</span><i><ArrowRight/></i></span></div>
          <span className="path-cta">CREATE WITH AI <ArrowRight/></span>
        </button>
        <button className="path-card path-dyo" onClick={()=>onStart('dyo')}>
          <PathHeading icon={<Shirt/>} title="DESIGN YOUR OWN" sub="CREATE IT YOURSELF"/>
          <p>Use our 3D studio and professional design tools to bring your vision to life.</p>
          <div className="path-visual pv-dyo" aria-hidden="true"><div className="mini-tools"><MousePointer2/><PenTool/><Type/><Layers/><Palette/></div><div className="pv-stage"><img src={media('showroom/garment-jersey.webp')} alt="" loading="lazy"/></div><span className="pv-wheel"/></div>
          <span className="path-cta">OPEN 3D DESIGNER <ArrowRight/></span>
        </button>
        <Link to="/artboard" className="path-card path-artboard">
          <PathHeading icon={<PenTool/>} title="3DEEZI ARTBOARD" sub="PROFESSIONAL EDITING"/>
          <p>Advanced 2D design tools for full control. Create, edit and perfect your artwork.</p>
          <div className="path-visual mini-artboard" aria-hidden="true"><div className="mini-bar"><span/><span/><span/></div><div className="mini-tools"><MousePointer2/><PenTool/><Type/><Layers/></div><div className="mini-canvas"><img src={media('images/emblem-final.png')} alt=""/><i/><i/><i/><i/></div><div className="mini-swatches"><span/><span/><span/><span/></div></div>
          <span className="path-cta">OPEN ARTBOARD <ArrowRight/></span>
        </Link>
        <Link to="/team" className="path-card path-team">
          <PathHeading icon={<Users/>} title="3DEEZI TEAM" sub="REAL DESIGNERS. REAL RESULTS."/>
          <p>Don’t want to design it yourself? Our professional design team will create it for you.</p>
          <div className="path-visual pv-team" aria-hidden="true"><img src={media('images/art/home_team.webp')} alt="" loading="lazy" width={960} height={640}/></div>
          <span className="path-cta">GET A DESIGNER <ArrowRight/></span>
        </Link>
      </section>
    </div></div>
    {/* ORDER NOW WITH 3DEEZI: the order form, uploading an order, and My Orders */}
    <OrderNow/>
    {/* 3DEEZI Rewards (coming soon): keep below the Orders section */}
    <RewardsBanner/>
  </div>;
}

function PathHeading({icon,title,sub}:{icon:ReactNode;title:string;sub:string}){
  return <div className="path-heading"><span className="path-icon">{icon}</span><span className="path-titles"><h2>{title}</h2><span className="path-sub">{sub}</span></span></div>;
}

export function DownloadsPage(){
  return <div className="page-shell downloads-page"><section className="download-copy"><span className="eyebrow">YOUR STUDIO, WHEREVER YOU CREATE</span><h1>A big idea.<br/><span>In your pocket.</span></h1><p>Design your kit, organize your artwork, and keep your projects together across the 3DEEZI website and apps.</p><StoreBadges className="download-stores" soon /><p className="download-status">Official store downloads will appear here when the apps are published.</p><Link to="/studio" className="button button-gradient"><Monitor size={18}/> DESIGN IN YOUR BROWSER <ArrowRight size={18}/></Link><div className="download-features"><span><Palette size={15}/> Live kit customization</span><span><Layers size={15}/> Artwork & saved projects</span><span><Box size={15}/> Interactive 3D previews</span></div></section><div className="phone-display"><div className="phone-halo"/><div className="phone-mockup"><div className="phone-camera"/><div className="phone-screen"><img className="phone-brand" src={media('images/brand-final.png')} alt="3DEEZI"/><span className="phone-screen-label">YOUR NEXT KIT STARTS HERE</span><img className="phone-jersey" src={media('images/art/onboarding.jpg')} alt="3DEEZI mobile kit preview"/><div className="phone-tools"><Palette/><Layers/><Type/><Box/></div><span className="phone-save">YOUR SPORT. YOUR WAY.</span></div></div><span className="phone-caption">3DEEZI · WEBSITE & APPS</span></div></div>;
}
