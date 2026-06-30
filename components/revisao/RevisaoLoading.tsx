'use client';

import { useEffect, useRef, useState } from 'react';

type EtapaStatus = 'pending' | 'active' | 'done';

interface Etapa {
  titulo: string;
  descricao: string;
  duracaoMs: number; // 0 = última etapa, fica em loop
}

const ETAPAS: Etapa[] = [
  { titulo: 'Lendo seu manuscrito', descricao: 'Processando capítulos e parágrafos', duracaoMs: 6500 },
  { titulo: 'Mapeando a estrutura narrativa', descricao: 'Detectando cenas, arcos e transições', duracaoMs: 8000 },
  { titulo: 'Identificando sua voz autoral', descricao: 'Capturando o estilo único da sua escrita', duracaoMs: 11000 },
  { titulo: 'Analisando coesão textual', descricao: 'Verificando fios narrativos e amarrações', duracaoMs: 9500 },
  { titulo: 'Revisando gramática e pontuação', descricao: 'Sugerindo correções e melhorias', duracaoMs: 13000 },
  { titulo: 'Conferindo consistência', descricao: 'Personagens, lugares e linha do tempo', duracaoMs: 10500 },
  { titulo: 'Refinando ritmo e fluidez', descricao: 'Avaliando a cadência das frases', duracaoMs: 12000 },
  { titulo: 'Consolidando sugestões', descricao: 'Organizando tudo para você revisar', duracaoMs: 0 },
];

interface RevisaoLoadingProps {
  /** Se passado, exibe estado de erro em vez da animação. */
  erro?: string | null;
  /** Callback chamado quando o autor clica em "Refazer análise". */
  onRefazer?: () => void;
}

export function RevisaoLoading({ erro, onRefazer }: RevisaoLoadingProps) {
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (erro) return;
    setCurrentStep(0);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [erro]);

  useEffect(() => {
    if (erro) return;
    if (currentStep < 0) return;
    if (currentStep >= ETAPAS.length - 1) return;

    const etapa = ETAPAS[currentStep];
    timeoutRef.current = setTimeout(() => {
      setCurrentStep((prev) => prev + 1);
    }, etapa.duracaoMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentStep, erro]);

  if (erro) {
    return <ErroState mensagem={erro} onRefazer={onRefazer} />;
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 32px 40px' }}>
      <div
        style={{
          fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#c9a84c',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#c9a84c',
            animation: 'autoriaPulse 1.6s ease-in-out infinite',
          }}
        />
        Em andamento
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
          fontWeight: 400,
          fontSize: 32,
          lineHeight: 1.1,
          color: '#0a0a0a',
          margin: '0 0 8px',
          letterSpacing: '-0.015em',
        }}
      >
        Sua revisão editorial
        <br />
        <em style={{ fontStyle: 'italic', color: '#6b6b6b' }}>está sendo preparada</em>
      </h1>

      <p
        style={{
          fontSize: 14,
          color: '#6b6b6b',
          lineHeight: 1.6,
          margin: '0 0 36px',
          maxWidth: 440,
        }}
      >
        Aguarde enquanto a IA analisa cada capítulo, identifica seu estilo e prepara as sugestões.
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          border: '0.5px solid #e6e3da',
          borderRadius: 10,
          background: '#fdfcf9',
          overflow: 'hidden',
        }}
      >
        {ETAPAS.map((etapa, i) => {
          let status: EtapaStatus = 'pending';
          if (i < currentStep) status = 'done';
          else if (i === currentStep) status = 'active';

          return <EtapaRow key={i} etapa={etapa} status={status} isLast={i === ETAPAS.length - 1} />;
        })}
      </div>

      <div
        style={{
          marginTop: 28,
          padding: '16px 20px',
          background: 'rgba(201, 168, 76, 0.06)',
          borderRadius: 8,
          borderLeft: '2px solid #c9a84c',
        }}
      >
        <p style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.65, margin: 0 }}>
          <strong style={{ color: '#0a0a0a', fontWeight: 500 }}>Pode demorar alguns minutos.</strong>{' '}
          A análise editorial do seu manuscrito está sendo processada — não feche esta janela.
        </p>
      </div>

      <style jsx global>{`
        @keyframes autoriaPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes autoriaSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function EtapaRow({
  etapa,
  status,
  isLast,
}: {
  etapa: Etapa;
  status: EtapaStatus;
  isLast: boolean;
}) {
  const opacity = status === 'pending' ? 0.35 : 1;
  const background =
    status === 'active'
      ? 'linear-gradient(90deg, rgba(201,168,76,0.07), rgba(201,168,76,0.02))'
      : 'transparent';

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '16px 20px',
        alignItems: 'flex-start',
        background,
        opacity,
        borderBottom: isLast ? 'none' : '0.5px solid #f0ede4',
        transition: 'background 0.4s ease, opacity 0.4s ease',
      }}
    >
      <EtapaIcon status={status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
            fontWeight: 500,
            fontSize: 15,
            color: status === 'pending' ? '#6b6b6b' : '#0a0a0a',
            lineHeight: 1.3,
            letterSpacing: '-0.005em',
            marginBottom: 2,
          }}
        >
          {etapa.titulo}
        </div>
        <div
          style={{
            fontSize: 12,
            color: status === 'active' ? '#6b6b6b' : '#9a9a9a',
            lineHeight: 1.5,
          }}
        >
          {etapa.descricao}
        </div>
      </div>
    </div>
  );
}

function EtapaIcon({ status }: { status: EtapaStatus }) {
  const baseStyle: React.CSSProperties = {
    flexShrink: 0,
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    position: 'relative',
  };

  if (status === 'done') {
    return (
      <div style={{ ...baseStyle, background: '#c9a84c', color: '#0a0a0a', fontWeight: 700, fontSize: 12 }}>
        ✓
      </div>
    );
  }

  if (status === 'active') {
    return (
      <div style={{ ...baseStyle, border: '1.5px solid #c9a84c' }}>
        <span
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: '50%',
            border: '1.5px solid transparent',
            borderTopColor: '#c9a84c',
            animation: 'autoriaSpin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  return <div style={{ ...baseStyle, border: '1.5px solid #ccc9be' }} />;
}

function ErroState({ mensagem, onRefazer }: { mensagem: string; onRefazer?: () => void }) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '72px 32px', textAlign: 'center' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(184, 45, 45, 0.08)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 26,
          color: '#b82d2d',
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        !
      </div>

      <div
        style={{
          fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#b82d2d',
          marginBottom: 12,
        }}
      >
        Erro de processamento
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
          fontWeight: 500,
          fontSize: 26,
          color: '#0a0a0a',
          margin: '0 0 14px',
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
        }}
      >
        A análise não pôde ser concluída
      </h2>

      <p
        style={{
          fontSize: 14,
          color: '#6b6b6b',
          lineHeight: 1.65,
          margin: '0 auto 32px',
          maxWidth: 380,
        }}
      >
        {mensagem || 'Algo deu errado durante o processamento. Seu manuscrito está salvo — você pode tentar novamente.'}
      </p>

      {onRefazer && (
        <button
          onClick={onRefazer}
          style={{
            background: '#0a0a0a',
            color: '#e8c96a',
            border: 'none',
            padding: '13px 32px',
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 6,
            cursor: 'pointer',
            letterSpacing: '0.01em',
            fontFamily: 'inherit',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a2e')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#0a0a0a')}
        >
          Refazer análise
        </button>
      )}
    </div>
  );
}
