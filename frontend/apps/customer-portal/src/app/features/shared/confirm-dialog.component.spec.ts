import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let component: ConfirmDialogComponent;

  function setInputs(inputs: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ConfirmDialogComponent] });
    fixture = TestBed.createComponent(ConfirmDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing while closed', () => {
    setInputs({ open: false, title: 'Cancel quote?' });
    expect(fixture.nativeElement.querySelector('.cd-dialog')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cd-backdrop')).toBeNull();
  });

  it('renders the title, message and labels when opened', () => {
    setInputs({
      open: true,
      title: 'Cancel quote?',
      message: 'This cannot be undone.',
      confirmLabel: 'Yes, cancel',
      cancelLabel: 'Keep quote',
    });

    const dialog: HTMLElement = fixture.nativeElement.querySelector('.cd-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('.cd-title')?.textContent).toContain('Cancel quote?');
    expect(dialog.querySelector('.cd-message')?.textContent).toContain('This cannot be undone.');

    const buttons = dialog.querySelectorAll('button');
    expect(buttons[0].textContent).toContain('Keep quote');
    expect(buttons[1].textContent).toContain('Yes, cancel');
  });

  it('applies the danger style class when tone="danger"', () => {
    setInputs({ open: true, title: 'Delete address?', tone: 'danger' });
    const confirmBtn = fixture.nativeElement.querySelector('button.bb-btn-danger');
    expect(confirmBtn).not.toBeNull();
  });

  it('emits confirmed when the confirm button is clicked', () => {
    const onConfirmed = jasmine.createSpy('confirmed');
    component.confirmed.subscribe(onConfirmed);
    setInputs({ open: true, title: 'Confirm?' });

    const confirmBtn = fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement;
    confirmBtn.click();
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('emits cancelled when the cancel button is clicked', () => {
    const onCancelled = jasmine.createSpy('cancelled');
    component.cancelled.subscribe(onCancelled);
    setInputs({ open: true, title: 'Confirm?' });

    const cancelBtn = fixture.nativeElement.querySelectorAll('button')[0] as HTMLButtonElement;
    cancelBtn.click();
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });

  it('emits cancelled when the backdrop is clicked', () => {
    const onCancelled = jasmine.createSpy('cancelled');
    component.cancelled.subscribe(onCancelled);
    setInputs({ open: true, title: 'Confirm?' });

    const backdrop = fixture.nativeElement.querySelector('.cd-backdrop') as HTMLElement;
    backdrop.click();
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });

  it('does nothing when buttons are clicked in busy state', () => {
    const onConfirmed = jasmine.createSpy('confirmed');
    const onCancelled = jasmine.createSpy('cancelled');
    component.confirmed.subscribe(onConfirmed);
    component.cancelled.subscribe(onCancelled);

    setInputs({ open: true, title: 'Confirm?', busy: true });

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeTrue();

    // Even firing the click handlers manually should be a no-op while busy.
    component.onConfirm();
    component.onCancel();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it('renders a spinner glyph inside the confirm button when busy', () => {
    setInputs({ open: true, title: 'Confirm?', busy: true });
    const spinner = fixture.nativeElement.querySelector('.cd-spin');
    expect(spinner).not.toBeNull();
  });

  it('binds aria-labelledby / aria-describedby to the rendered headings', () => {
    setInputs({ open: true, title: 'Confirm?', message: 'Body' });
    const dialog = fixture.nativeElement.querySelector('.cd-dialog') as HTMLElement;
    const titleId = dialog.getAttribute('aria-labelledby');
    const messageId = dialog.getAttribute('aria-describedby');

    expect(titleId).toMatch(/^cd-title-/);
    expect(messageId).toMatch(/^cd-message-/);
    expect(fixture.nativeElement.querySelector(`#${titleId}`)).not.toBeNull();
    expect(fixture.nativeElement.querySelector(`#${messageId}`)).not.toBeNull();
  });

  it('Escape on the document closes the dialog when not busy', () => {
    const onCancelled = jasmine.createSpy('cancelled');
    component.cancelled.subscribe(onCancelled);
    setInputs({ open: true, title: 'Confirm?' });

    component.onEscape();
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });

  it('Escape is ignored when busy', () => {
    const onCancelled = jasmine.createSpy('cancelled');
    component.cancelled.subscribe(onCancelled);
    setInputs({ open: true, title: 'Confirm?', busy: true });

    component.onEscape();
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it('focuses the confirm button on next tick after opening', async () => {
    setInputs({ open: false, title: 'Confirm?' });
    setInputs({ open: true, title: 'Confirm?' });

    // queueMicrotask schedules focus — flush microtasks before asserting.
    await Promise.resolve();
    const confirmBtn = fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(document.activeElement).toBe(confirmBtn);
  });
});
