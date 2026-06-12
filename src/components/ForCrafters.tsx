import { Wrench } from 'lucide-react';

export default function ForCrafters() {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', padding: '2rem', textAlign: 'center' }}>
      <div className="ff-card-framed" style={{ padding: '3rem', maxWidth: '500px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(135deg, rgba(197,160,89,0.05) 0%, rgba(21,31,51,0.4) 100%)' }}>
        <Wrench size={48} style={{ color: 'var(--color-gold)', filter: 'drop-shadow(0 0 10px rgba(197,160,89,0.3))' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--color-text-title)', letterSpacing: '0.05em' }}>Under Construction</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Crafter?
            <br />
            Soon here will be a list of items I'm buying, DM me in discord if interested 
            <br />
            @Alamai
          </p>
        </div>
      </div>
    </div>
  );
}
