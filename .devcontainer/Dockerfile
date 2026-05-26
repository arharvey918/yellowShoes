FROM debian:trixie

ENV DEBIAN_FRONTEND=noninteractive \
    GOPATH=/root/go \
    PATH=/root/go/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    SHELL=/usr/bin/zsh \
    ZSH=/root/.oh-my-zsh

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
        autoconf \
        automake \
        build-essential \
        ca-certificates \
        cmake \
        curl \
        file \
        git \
        golang-go \
        iproute2 \
        jq \
        lame \
        less \
        libao-dev \
        libao4 \
        libfftw3-bin \
        libfftw3-dev \
        librtlsdr-dev \
        librtlsdr0 \
        libtool \
        nodejs \
        npm \
        openssh-client \
        pkg-config \
        procps \
        python3 \
        wget \
        zsh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/ohmyzsh/ohmyzsh.git "${ZSH}" && \
    if [ ! -f /root/.zshrc ]; then cp "${ZSH}/templates/zshrc.zsh-template" /root/.zshrc; fi && \
    chsh -s /usr/bin/zsh root

RUN git clone --depth 1 https://github.com/theori-io/nrsc5.git /tmp/nrsc5 && \
    mkdir -p /tmp/nrsc5/build && \
    cd /tmp/nrsc5/build && \
    cmake .. && \
    make -j"$(nproc)" && \
    make install && \
    ldconfig && \
    rm -rf /tmp/nrsc5

ENV GOBIN=/usr/local/bin

RUN go install golang.org/x/tools/gopls@latest && \
    go install golang.org/x/tools/cmd/goimports@latest && \
    go install github.com/go-delve/delve/cmd/dlv@latest && \
    go install honnef.co/go/tools/cmd/staticcheck@latest

RUN npm install -g @github/copilot typescript-language-server

ENV GOBIN=

WORKDIR /workspaces/yellowShoes
CMD ["sleep", "infinity"]