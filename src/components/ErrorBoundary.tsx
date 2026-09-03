import React, { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Storage clear error:', e);
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error ? this.state.error.toString() : "Noma'lum xatolik";

      return (
        <div className="min-h-screen w-full bg-[#0d1117] text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#161b22] border border-slate-700/60 rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 className="text-xl font-bold text-white mb-2">
              Saytni yuklashda xatolik yuz berdi
            </h2>
            <p className="text-sm text-slate-400 mb-5 leading-relaxed">
              Brauzeringizda tizim komponentlarini yuklashda kutilmagan to'siq bo'ldi. Quyidagi tugma orqali sahifani yangilab ko'ring:
            </p>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-left mb-5 max-h-36 overflow-y-auto">
              <p className="text-xs font-mono text-rose-400 break-words">
                {errorMessage}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-medium rounded-xl transition shadow-lg shadow-blue-600/20 text-sm"
              >
                Sahifani yangilash 🔄
              </button>
              <button
                onClick={this.handleClearAndReload}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition text-xs border border-slate-700/50"
              >
                Keshni tozalash va qayta yuklash
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
