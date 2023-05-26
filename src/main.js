import {XispecWrapper} from "./xispec-wrapper";
import {PepInputView} from "./PepInputView";
import {PrecursorInfoView} from "./PrecursorInfoView";
import {AnnotatedSpectrumModel} from "./annotated-spectrum-model";

export function createApp(options) {
    return new XispecWrapper(options);
}

export function createPepInputView(view_options) {
    return new PepInputView(view_options);
}

export function createPrecursorInfoView(view_options) {
    return new PrecursorInfoView(view_options);
}

export function createAnnotatedSpectrumModel(model_options) {
    return new AnnotatedSpectrumModel(model_options);
}