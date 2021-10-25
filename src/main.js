import {xiSPEC_wrapper} from "./Wrapper";
import {PepInputView} from "./PepInputView";
import {PrecursorInfoView} from "./PrecursorInfoView";
import {AnnotatedSpectrumModel} from "./AnnotatedSpectrumModel";

export function createApp(options){
    return new xiSPEC_wrapper(options);
}

export function createPepInputView(view_options){
    return new PepInputView(view_options);
}

export function createPrecursorInfoView(view_options){
    return new PrecursorInfoView(view_options);
}

export function createAnnotatedSpectrumModel(model_options){
    return new AnnotatedSpectrumModel(model_options);
}