import React from 'react';

interface GenericPageProps {
  title: string;
}

const GenericPage: React.FC<GenericPageProps> = ({ title }) => {
  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <div className="header-row">
            <h1 className="header-title">{title}</h1>
          </div>
        </header>
        <div className="main-content" style={{ flexDirection: 'column' }}>
          <p>This is the {title} page. Content will be added here later.</p>
          <p>
            To demonstrate scrolling, here is some placeholder text. Lorem ipsum dolor sit amet,
            consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet,
            adipiscing nec, ultricies sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa,
            varius a, semper congue, euismod non, mi. Proin porttitor, orci nec nonummy molestie, enim
            est eleifend mi, non fermentum diam nisl sit amet erat. Duis semper. Duis arcu massa,
            scelerisque vitae, consequat in, pretium a, enim. Pellentesque congue. Ut in risus volutpat
            libero pharetra tempor. Cras vestibulum bibendum augue. Praesent egestas leo in pede.
            Praesent blandit odio eu enim. Pellentesque sed dui ut augue blandit sodales. Vestibulum
            ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Aliquam nibh.
            Mauris ac mauris sed pede pellentesque fermentum. Maecenas adipiscing ante non diam.
            Praesent consectetuer bibendum nulla.
          </p>
          <p>
            Nam quis nulla. Integer malesuada. In in enim a arcu imperdiet malesuada. Sed vel lectus.
            Donec odio urna, tempus molestie, porttitor ut, iaculis quis, sem. Phasellus rhoncus.
            Aenean id metus id velit ullamcorper pulvinar. Vestibulum fermentum tortor id mi.
            Pellentesque ipsum. Nulla ac enim. In tempor, turpis nec euismod scelerisque, quam turpis
            adipiscing lorem, vitae mattis nibh ligula nec sem. Duis aliquam convallis nunc. Proin at
            turpis a pede posuere nonummy. Integer non enim. Praesent euismod nunc eu purus. Donec
            bibendum quam in tellus. Nullam cursus pulvinar lectus. Donec et mi. Nam vulputate metus
            eu enim. Vestibulum pellentesque felis eu massa.
          </p>
          <p>
            Quisque ullamcorper placerat ipsum. Cras nibh. Morbi vel justo vitae lacus tincidunt
            ultrices. Lorem ipsum dolor sit amet, consectetuer adipiscing elit. In hac habitasse platea
            dictumst. Integer tempus convallis augue. Etiam facilisis. Nunc elementum fermentum wisi.
            Aenean placerat. Ut imperdiet, enim sed gravida sollicitudin, felis odio placerat quam, ac
            pulvinar elit purus eget enim. Nunc vitae tortor. Proin tempus nibh sit amet nisl.
            Vivamus quis tortor vitae risus porta vehicula.
          </p>
          <p>
            Fusce mauris. Vestibulum luctus nibh at lectus. Sed bibendum, nulla a faucibus semper, leo
            velit ultricies tellus, ac venenatis arcu wisi vel nisl. Vestibulum diam. Aliquam lectus
            urna, viverra in, efficitur eget, facilisis nec, justo. Fusce elit. Nulla facilisi. Sed
            semper, nisl id feugiat eleifend, erat est digssim felis, vitae tincidunt nunc sapien eu
            suscipit. Nam nec sem.
          </p>
          <p>
            Maecenas per. Proin sed toho. Class aptent taciti sociosqu ad litora torquent per conubia
            nostra, per inceptos hymenaeos. In quam. Pellentesque habitant morbi tristique senectus et
            netus et malesuada fames ac turpis egestas.
          </p>
          <p>
            Vestibulum ac, consectetuer, vitae, tellus. Curabitur et consectetuer, elit. Ut nonummy,
            nisl, go, eu, semper, nec, eros. Vestibulum ante ipsum primis in faucibus orci luctus et
            ultrices posuere cubilia Curae; Morbi lacinia molestie dui. Praesent blandit, quam, ac,
            lacinia, euismod, mi, ut, enim, quis, consectetuer, leo, vel, wisi. In hac habitasse platea
            dictumst.
          </p>
          <p>
            Nam quis nulla. Integer malesuada. In in enim a arcu imperdiet malesuada. Sed vel lectus.
            Donec odio urna, tempus molestie, porttitor ut, iaculis quis, sem. Phasellus rhoncus.
            Aenean id metus id velit ullamcorper pulvinar. Vestibulum fermentum tortor id mi.
            Pellentesque ipsum. Nulla ac enim. In tempor, turpis nec euismod scelerisque, quam turpis
            adipiscing lorem, vitae mattis nibh ligula nec sem. Duis aliquam convallis nunc. Proin at
            turpis a pede posuere nonummy. Integer non enim. Praesent euismod nunc eu purus. Donec
            bibendum quam in tellus. Nullam cursus pulvinar lectus. Donec et mi. Nam vulputate metus
            eu enim. Vestibulum pellentesque felis eu massa.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GenericPage; 