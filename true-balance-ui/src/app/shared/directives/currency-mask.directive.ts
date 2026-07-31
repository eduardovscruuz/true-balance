import { Directive, ElementRef, HostListener, inject, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Máscara de moeda "estilo caixa eletrônico": os dígitos digitados são sempre
 * interpretados como centavos, acumulando da direita pra esquerda (ex: digitar
 * "1010" mostra "R$ 10,10"). O FormControl guarda o número puro (10.10).
 */
@Directive({
  selector: '[appCurrencyMask]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyMaskDirective),
      multi: true,
    },
  ],
})
export class CurrencyMaskDirective implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef<HTMLInputElement>);

  private readonly formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('input', ['$event'])
  handleInput(event: Event): void {
    const rawValue = (event.target as HTMLInputElement).value;
    const amount = this.parseDigitsAsCents(rawValue);
    this.elementRef.nativeElement.value = this.formatter.format(amount);
    this.onChange(amount);
  }

  @HostListener('blur')
  handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: number | null): void {
    // null/undefined = campo vazio de verdade (mostra o placeholder), não "R$ 0,00".
    this.elementRef.nativeElement.value = value === null || value === undefined ? '' : this.formatter.format(value);
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  private parseDigitsAsCents(rawValue: string): number {
    const digitsOnly = rawValue.replace(/\D/g, '');
    const cents = digitsOnly === '' ? 0 : parseInt(digitsOnly, 10);
    return cents / 100;
  }
}
