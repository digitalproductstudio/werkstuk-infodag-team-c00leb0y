import * as THREE from "three";
import { Model } from "./Model";

export class Scene {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    public models : Model[] = [];

    constructor( 
        width: number,
        height: number,
        wrapper: HTMLElement
     ) {
        this.scene = new THREE.Scene();
        // props: camera: ( fov: number, aspect: number, near: number, far: number )
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            alpha: true
        });
        this.renderer.setSize(width, height);
        wrapper.appendChild(this.renderer.domElement);

        this.renderer.domElement.id = "layer-3D";

        // lichtbron
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0, 2, 5);
        this.scene.add(light);

        // camera position
        this.camera.position.z = 1;
     }

    public add3DModel( model : Model ) {
        this.models.push(model);
        model.loadModel((loadedmodel) => {
            this.scene.add(loadedmodel);
            this.render();
        })
    }

    public render() {
        this.renderer.render(this.scene, this.camera);
    }

}